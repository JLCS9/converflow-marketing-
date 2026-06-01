'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Select, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';
import { parseCsv, type ParsedCsv } from './csv-parser';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

// Standard target fields the user can map a CSV column to.
interface StandardTarget {
  key: string;
  label: string;
  required?: boolean;
}
const STANDARD_TARGETS: StandardTarget[] = [
  { key: 'name', label: 'Nombre', required: true },
  { key: 'lastName', label: 'Apellido' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'status', label: 'Estado' },
  { key: 'source', label: 'Fuente' },
];

const IGNORE_KEY = '__ignore__';

interface Targets {
  [csvHeader: string]: string; // empty string == ignore
}

function autoSuggest(
  header: string,
  customFields: CustomFieldDefinition[],
): string {
  const norm = header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
  if (!norm) return IGNORE_KEY;

  // Standard field aliases
  const standardAliases: Record<string, string> = {
    nombre: 'name',
    name: 'name',
    firstname: 'name',
    contacto: 'name',
    fullname: 'name',
    apellido: 'lastName',
    apellidos: 'lastName',
    lastname: 'lastName',
    surname: 'lastName',
    email: 'email',
    correo: 'email',
    mail: 'email',
    telefono: 'phone',
    phone: 'phone',
    movil: 'phone',
    celular: 'phone',
    status: 'status',
    estado: 'status',
    fase: 'status',
    fuente: 'source',
    source: 'source',
    origen: 'source',
    canal: 'source',
  };
  if (standardAliases[norm]) return standardAliases[norm];

  // Try matching against custom field keys/labels
  for (const def of customFields) {
    const k = def.key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const l = def.label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
    if (k === norm || l === norm) return `cf:${def.key}`;
  }
  return IGNORE_KEY;
}

function normaliseStatus(raw: string): string | undefined {
  const norm = raw.trim().toLowerCase();
  // Maps every previously-supported alias to the new 3-state model.
  // The API also accepts the legacy keys but we normalise client-side so the
  // preview already shows what's going to be persisted.
  const map: Record<string, string> = {
    lead: 'LEAD',
    new: 'LEAD',
    nuevo: 'LEAD',
    contacted: 'LEAD',
    contactado: 'LEAD',
    qualified: 'LEAD',
    cualificado: 'LEAD',
    cliente: 'CLIENT',
    client: 'CLIENT',
    converted: 'CLIENT',
    convertido: 'CLIENT',
    ganado: 'CLIENT',
    won: 'CLIENT',
    lost: 'LOST',
    perdido: 'LOST',
    perdida: 'LOST',
  };
  return map[norm];
}

export function ImportLeadsForm({
  customFields,
}: {
  customFields: CustomFieldDefinition[];
}) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [targets, setTargets] = useState<Targets>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Detect which mapping is missing required fields.
  const missingRequired = useMemo(() => {
    if (!parsed) return [] as string[];
    const mappedToName = Object.values(targets).includes('name');
    const cfRequired = customFields.filter((c) => c.required);
    const mappedKeys = new Set(Object.values(targets));
    const issues: string[] = [];
    if (!mappedToName) issues.push('Nombre');
    for (const cf of cfRequired) {
      if (!mappedKeys.has(`cf:${cf.key}`)) issues.push(cf.label);
    }
    return issues;
  }, [parsed, targets, customFields]);

  function onFile(file: File) {
    file
      .text()
      .then((text) => {
        const p = parseCsv(text);
        if (p.headers.length === 0) {
          setError('El CSV está vacío o no tiene cabeceras.');
          setParsed(null);
          return;
        }
        // Suggest mappings
        const init: Targets = {};
        for (const h of p.headers) init[h] = autoSuggest(h, customFields);
        setTargets(init);
        setParsed(p);
        setError(null);
        setResult(null);
      })
      .catch(() => setError('No se pudo leer el archivo.'));
  }

  function buildPayload(): {
    leads: Array<Record<string, unknown> & { name: string; customFields?: Record<string, unknown> }>;
  } {
    if (!parsed) return { leads: [] };
    const leads: Array<Record<string, unknown> & { name: string; customFields?: Record<string, unknown> }> = [];
    for (const row of parsed.rows) {
      const lead: Record<string, unknown> = {};
      const cf: Record<string, unknown> = {};
      let hasAnything = false;
      for (const [header, target] of Object.entries(targets)) {
        const raw = row[header];
        if (!raw || target === IGNORE_KEY) continue;
        hasAnything = true;
        if (target.startsWith('cf:')) {
          cf[target.slice(3)] = raw;
        } else if (target === 'status') {
          const s = normaliseStatus(raw);
          if (s) lead.status = s;
        } else {
          lead[target] = raw;
        }
      }
      if (!hasAnything) continue;
      if (Object.keys(cf).length) lead.customFields = cf;
      if (!lead.name) continue; // skip silently if no name
      leads.push(lead as { name: string });
    }
    return { leads };
  }

  function doImport() {
    if (!parsed) return;
    const payload = buildPayload();
    if (payload.leads.length === 0) {
      setError('No hay filas válidas para importar.');
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await apiFetch<ImportResult>('/leads/import', {
          method: 'POST',
          json: payload,
        });
        setResult(res);
        if (res.imported > 0) {
          toast.success(`${res.imported} leads importados`);
        }
        if (res.errors.length > 0) {
          toast.error(`${res.errors.length} filas con errores`);
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Error al importar');
      }
    });
  }

  return (
    <Card className="space-y-5">
      <div>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="block text-sm"
        />
        {parsed && (
          <p className="mt-2 text-xs text-ink-500">
            {parsed.rows.length} filas detectadas · separador <code className="font-mono">{parsed.separator}</code> · {parsed.headers.length} columnas.
          </p>
        )}
      </div>

      {parsed && (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-mono uppercase tracking-wider text-ink-500">
              Mapeo de columnas
            </h3>
            <p className="text-xs text-ink-500">
              Cada columna del CSV se enlaza a un campo de Converflow. Si no la necesitas, déjala como "Ignorar".
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {parsed.headers.map((h) => (
                <Field key={h} label={h} help={`Ej.: "${parsed.rows[0]?.[h] ?? ''}"`}>
                  <Select
                    value={targets[h] ?? IGNORE_KEY}
                    onChange={(e) => setTargets({ ...targets, [h]: e.target.value })}
                  >
                    <option value={IGNORE_KEY}>— Ignorar columna —</option>
                    <optgroup label="Campos estándar">
                      {STANDARD_TARGETS.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                          {t.required ? ' (obligatorio)' : ''}
                        </option>
                      ))}
                    </optgroup>
                    {customFields.length > 0 && (
                      <optgroup label="Campos personalizados">
                        {customFields.map((cf) => (
                          <option key={cf.id} value={`cf:${cf.key}`}>
                            {cf.label}
                            {cf.required ? ' (obligatorio)' : ''} · {cf.type}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </Select>
                </Field>
              ))}
            </div>
          </section>

          {missingRequired.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Falta mapear: <strong>{missingRequired.join(', ')}</strong>.
            </div>
          )}

          <section>
            <h3 className="text-sm font-mono uppercase tracking-wider text-ink-500">Vista previa</h3>
            <div className="mt-2 overflow-x-auto rounded-md border border-ink-100">
              <table className="w-full min-w-full text-xs">
                <thead className="bg-ink-100/50 text-ink-600">
                  <tr>
                    {parsed.headers.map((h) => (
                      <th key={h} className="px-2 py-1.5 text-left font-mono">
                        {h}
                        <div className="text-[10px] font-normal text-ink-500">
                          {targets[h] === IGNORE_KEY
                            ? '—'
                            : targets[h]?.startsWith('cf:')
                            ? customFields.find((c) => c.key === targets[h]!.slice(3))?.label ?? targets[h]
                            : STANDARD_TARGETS.find((t) => t.key === targets[h])?.label ?? targets[h]}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t border-ink-100">
                      {parsed.headers.map((h) => (
                        <td key={h} className="px-2 py-1 align-top">
                          {row[h] || <span className="text-ink-400">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-2">
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            ✓ Importados: <strong>{result.imported}</strong> · Saltados: {result.skipped}
          </div>
          {result.errors.length > 0 && (
            <details className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-amber-900">
                {result.errors.length} {result.errors.length === 1 ? 'fila con error' : 'filas con errores'} — ver detalle
              </summary>
              <ul className="mt-2 space-y-1 text-amber-900">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">Fila {e.row}:</span> {e.reason}
                  </li>
                ))}
                {result.errors.length > 50 && (
                  <li className="italic">… y {result.errors.length - 50} más.</li>
                )}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
        <button
          type="button"
          onClick={() => router.push('/app/leads')}
          className={buttonClass('secondary')}
          disabled={pending}
        >
          {result ? 'Volver a leads' : 'Cancelar'}
        </button>
        {parsed && !result && (
          <button
            type="button"
            disabled={pending || missingRequired.length > 0}
            onClick={doImport}
            className={buttonClass('primary')}
          >
            {pending ? 'Importando…' : `Importar ${parsed.rows.length} filas`}
          </button>
        )}
      </div>

      {/* Hint about supported statuses */}
      {parsed && (
        <p className="text-[11px] text-ink-500">
          Estado acepta: <strong>Lead</strong> · <strong>Cliente</strong> · <strong>Perdido</strong>{' '}
          (también alias en inglés: LEAD/NEW, CLIENT/WON, LOST). Lo que no encaje queda como Lead.
        </p>
      )}
    </Card>
  );
}
