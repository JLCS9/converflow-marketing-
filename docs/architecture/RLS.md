# Row Level Security

## Why

Multitenant pool models are easy to get wrong. A missing `WHERE
tenant_id = ...` is a data-leak waiting to happen. Postgres RLS pushes
that filter into the database itself: even a buggy query cannot cross
the tenant boundary.

## How

Two session variables drive the policies:

| Variable | Set by | Meaning |
|---|---|---|
| `app.tenant_id` | API per-request (`withTenant`) | The tenant the current connection is acting on behalf of. |
| `app.bypass_rls` | Platform/admin code (`withRlsBypass`) | When `'on'`, RLS is skipped for that transaction. Used by migrations, super admin, and bootstrap. |

Each tenant-scoped table has a single policy:

```sql
CREATE POLICY tenant_isolation ON <table>
FOR ALL
USING (rls_bypass_enabled() OR tenant_id = current_tenant_id())
WITH CHECK (rls_bypass_enabled() OR tenant_id = current_tenant_id());
```

`tenants` itself uses `id` instead of `tenant_id`.

`ALTER TABLE ... FORCE ROW LEVEL SECURITY` ensures even the table owner
(the Prisma migration role) is subject to RLS — so accidentally running
the API as a superuser doesn't silently bypass.

## In code

Always go through `PrismaService.withTenant(tenantId, ...)` for
tenant-scoped operations, and `PrismaService.bypass(...)` only when you
have an explicit reason (auth bootstrap, admin reads across tenants,
migrations).

Never call `this.prisma.raw.<model>` directly inside a request — the
session variables won't be set and policies will reject the query, or
worse, return empty results silently.

## Verifying

```sql
-- as the app role, simulate a request
SET LOCAL app.tenant_id = 'tenant_abc';
SELECT * FROM users;            -- only tenant_abc's users
SELECT * FROM bots;             -- only tenant_abc's bots
RESET app.tenant_id;
SELECT * FROM users;            -- empty (no tenant set, bypass off)
```

If you ever see a query return rows from multiple tenants, treat it as
P0 and check the call site — it's almost certainly missing the
`withTenant` wrapper.
