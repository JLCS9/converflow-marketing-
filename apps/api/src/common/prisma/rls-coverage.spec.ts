import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Guard against the P0 that has now happened twice: a new tenant-scoped model
 * ships without an RLS policy, and since the services query inside
 * `withTenant()` WITHOUT an explicit tenantId filter, every tenant sees every
 * other tenant's rows.
 *
 * It first bit us via the superuser connection (lesson #0). It bit us again with
 * `campaigns`, `campaign_recipients`, `suppressions`, `email_templates` and
 * `api_keys`, which were simply never added to rls-policies.sql.
 *
 * This is a STATIC check on purpose: it needs no database, so it runs in the
 * normal test suite and fails the moment someone adds a model with a tenantId
 * and forgets the policy.
 */

const DB_DIR = resolve(process.cwd(), '../../packages/db/prisma');
const schema = readFileSync(resolve(DB_DIR, 'schema.prisma'), 'utf8');
const rlsSql = readFileSync(resolve(DB_DIR, 'sql/rls-policies.sql'), 'utf8');

/** Models that carry a tenantId, mapped to their real table name. */
function tenantScopedTables(src: string): { model: string; table: string }[] {
  const out: { model: string; table: string }[] = [];
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(src))) {
    const [, model, body] = m;
    if (!body || !/^\s*tenantId\s+String/m.test(body)) continue;
    const mapped = /@@map\("([^"]+)"\)/.exec(body);
    out.push({ model: model!, table: mapped?.[1] ?? model!.toLowerCase() });
  }
  return out;
}

describe('RLS coverage', () => {
  const tables = tenantScopedTables(schema);

  it('finds the tenant-scoped models in the schema', () => {
    // Sanity check on the parser itself — if this ever drops to a handful, the
    // regex broke and the real assertion below would pass vacuously.
    expect(tables.length).toBeGreaterThan(25);
    expect(tables.map((t) => t.table)).toContain('leads');
  });

  it.each(tenantScopedTables(schema))(
    'enables row level security on $table (model $model)',
    ({ table }) => {
      expect(
        rlsSql.includes(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`),
        `${table} has a tenantId but no "ENABLE ROW LEVEL SECURITY" in rls-policies.sql`,
      ).toBe(true);
      expect(
        rlsSql.includes(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`),
        `${table} is missing FORCE ROW LEVEL SECURITY — the table owner would bypass it`,
      ).toBe(true);
      expect(
        new RegExp(`CREATE POLICY tenant_isolation ON ${table}\\b`).test(rlsSql),
        `${table} has no tenant_isolation policy`,
      ).toBe(true);
    },
  );
});
