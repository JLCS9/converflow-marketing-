'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { useFeedback } from '@/components/ui/feedback';
import { parseFlexibleDate } from '@converflow/shared';
import type { CustomFieldDefinition } from '@/components/custom-fields/types';
import { parseCsv, type ParsedCsv } from './csv-parser';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

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

type Targets = Record<string, string>;
type EditableRow = { values: Record<string, string>; serverError: string | null };

function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function autoSuggest(header: string, customFields: CustomFieldDefinition[]): string {
  const norm = normalise(header);
  if (!norm) return IGNORE_KEY;
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
  for (const def of customFields) {
    if (normalise(def.key) === norm || normalise(def.label) === norm) return `cf:${def.key}`;
  }
  return IGNORE_KEY;
}

function normaliseStatus(raw: string): 'LEAD' | 'CLIENT' | 'LOST' | null {
  const norm = raw.trim().toLowerCase();
  if (!norm) return null;
  const map: Record<string, 'LEAD' | 'CLIENT' | 'LOST'> = {
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
  return map[norm] ?? null;
}

function emailLooksValid(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Lightweight per-row validation that mirrors what the server does, so the
// user sees problems before pressing Importar.
function validateRow(
  row: Record<string, string>,
  targets: Targets,
  customFields: CustomFieldDefinition[],
): string | null {
  // Build resolved values per target.
  const resolved: Record<string, string> = {};
  const cf: Record<string, string> = {};
  for (const [header, target] of Object.entries(targets)) {
    const raw = (row[header] ?? '').trim();
    if (!raw || target === IGNORE_KEY) continue;
    if (target.startsWith('cf:')) cf[target.slice(3)] = raw;
    else resolved[target] = raw;
  }

  if (!resolved.name) return 'Falta el nombre.';
  if (resolved.email && !emailLooksValid(resolved.email)) {
    return `Email no válido: "${resolved.email}".`;
  }
  if (resolved.status && !normaliseStatus(resolved.status)) {
    return `Estado no reconocido: "${resolved.status}". Acepta Lead, Cliente o Perdido.`;
  }

  for (const def of customFields) {
    const v = cf[def.key];
    if (!v) {
      if (def.required) return `Falta "${def.label}" (obligatorio).`;
      continue;
    }
    switch (def.type) {
      case 'NUMBER':
        if (!Number.isFinite(Number(v.replace(',', '.')))) {
          return `"${def.label}" debería ser un número: "${v}".`;
        }
        break;
      case 'EMAIL':
        if (!emailLooksValid(v)) return `"${def.label}" no es un email válido: "${v}".`;
        break;
      case 'URL':
        try {
          new URL(v);
        } catch {
          return `"${def.label}" no es una URL válida: "${v}".`;
        }
        break;
      case 'DATE':
        if (!parseFlexibleDate(v)) {
          return `"${def.label}" no es una fecha válida: "${v}". Usa DD/MM/AAAA o AAAA-MM-DD.`;
        }
        break;
      case 'SELECT': {
        const opts = def.options ?? [];
        if (!opts.some((o) => o.value === v || o.label === v)) {
          return `"${def.label}": "${v}" no está entre las opciones.`;
        }
        break;
      }
      case 'MULTISELECT': {
        const opts = def.options ?? [];
        const parts = v
          .split(/[|;,]/)
          .map((s) => s.trim())
          .filter(Boolean);
        for (const p of parts) {
          if (!opts.some((o) => o.value === p || o.label === p)) {
            return `"${def.label}": "${p}" no está entre las opciones.`;
          }
        }
        break;
      }
      case 'BOOLEAN': {
        const s = v.toLowerCase();
        const valid = ['true', '1', 'yes', 'si', 'sí', 'x', 'false', '0', 'no'];
        if (!valid.includes(s)) return `"${def.label}" debería ser sí/no: "${v}".`;
        break;
      }
      case 'DOCUMENT':
        return `"${def.label}" es un campo Documento — no se puede importar por CSV.`;
    }
  }
  return null;
}

function buildPayload(
  rows: EditableRow[],
  targets: Targets,
): { leads: Record<string, unknown>[]; rowOf: number[] } {
  const leads: Record<string, unknown>[] = [];
  const rowOf: number[] = []; // payload[i] -> original row index
  rows.forEach((r, idx) => {
    if (r.serverError === null && !validateRow(r.values, targets, [])) {
      // (already pre-filtered by caller)
    }
    const lead: Record<string, unknown> = {};
    const cf: Record<string, unknown> = {};
    for (const [header, target] of Object.entries(targets)) {
      const raw = (r.values[header] ?? '').trim();
      if (!raw || target === IGNORE_KEY) continue;
      if (target.startsWith('cf:')) cf[target.slice(3)] = raw;
      else if (target === 'status') {
        const s = normaliseStatus(raw);
        if (s) lead.status = s;
      } else lead[target] = raw;
    }
    if (!lead.name) return;
    if (Object.keys(cf).length) lead.customFields = cf;
    leads.push(lead);
    rowOf.push(idx);
  });
  return { leads, rowOf };
}

export function ImportLeadsForm({ customFields }: { customFields: CustomFieldDefinition[] }) {
  const router = useRouter();
  const { toast } = useFeedback();
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [targets, setTargets] = useState<Targets>({});
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);

  // Per-row validation — recomputed whenever rows / targets change.
  const rowErrors = useMemo(() => {
    return rows.map((r) => {
      const local = validateRow(r.values, targets, customFields);
      return local ?? r.serverError;
    });
  }, [rows, targets, customFields]);

  const validCount = rowErrors.filter((e) => e === null).length;
  const errorCount = rowErrors.length - validCount;

  const missingMappingsRequired = useMemo(() => {
    if (!parsed) return [] as string[];
    const mapped = new Set(Object.values(targets));
    const issues: string[] = [];
    if (!mapped.has('name')) issues.push('Nombre');
    for (const cf of customFields) {
      if (cf.required && !mapped.has(`cf:${cf.key}`)) issues.push(cf.label);
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
        const init: Targets = {};
        for (const h of p.headers) init[h] = autoSuggest(h, customFields);
        setTargets(init);
        setRows(p.rows.map((r) => ({ values: { ...r }, serverError: null })));
        setParsed(p);
        setError(null);
        setResult(null);
      })
      .catch(() => setError('No se pudo leer el archivo.'));
  }

  function setCell(rowIdx: number, header: string, value: string) {
    setRows((prev) => {
      const next = [...prev];
      const cur = next[rowIdx]!;
      next[rowIdx] = {
        values: { ...cur.values, [header]: value },
        serverError: null, // user edit clears the previous server message
      };
      return next;
    });
  }

  function setTarget(header: string, value: string) {
    setTargets({ ...targets, [header]: value });
    // Clear server errors since the mapping changed.
    setRows((prev) => prev.map((r) => ({ ...r, serverError: null })));
  }

  function doImport() {
    if (!parsed) return;
    const validRowsIdx = rowErrors
      .map((e, i) => (e === null ? i : -1))
      .filter((i) => i >= 0);
    if (validRowsIdx.length === 0) {
      setError('No hay filas válidas para importar.');
      return;
    }
    // Build payload from VALID rows only.
    const subset = validRowsIdx.map((i) => rows[i]!);
    const { leads, rowOf } = buildPayload(subset, targets);
    setError(null);
    startTransition(async () => {
      try {
        const res = await apiFetch<ImportResult>('/leads/import', {
          method: 'POST',
          json: { leads },
        });
        // Map server errors back to original row indices. Server uses
        // row = (i + 2). i = rowIdxInSentArray.
        const annotated = [...rows];
        for (const e of res.errors) {
          const sentIdx = e.row - 2;
          const originalIdx = validRowsIdx[rowOf[sentIdx] ?? sentIdx];
          if (originalIdx != null) {
            annotated[originalIdx] = {
              ...annotated[originalIdx]!,
              serverError: e.reason,
            };
          }
        }
        setRows(annotated);
        setResult(res);
        if (res.imported > 0) toast.success(`${res.imported} leads importados`);
        if (res.errors.length > 0) {
          toast.error(`${res.errors.length} ${res.errors.length === 1 ? 'fila con error' : 'filas con errores'}`);
          setShowOnlyErrors(true);
        }
        router.refresh();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Error al importar');
      }
    });
  }

  return (
    <div className="space-y-5">
      <Card>
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
              {parsed.rows.length} {parsed.rows.length === 1 ? 'fila' : 'filas'} · separador{' '}
              <code className="font-mono">{parsed.separator}</code> · {parsed.headers.length} columnas.
            </p>
          )}
        </div>
      </Card>

      {parsed && (
        <Card>
          <section className="space-y-3">
            <h3 className="text-sm font-mono uppercase tracking-wider text-ink-500">
              1. Mapeo de columnas
            </h3>
            <p className="text-xs text-ink-500">
              Cada columna del CSV se enlaza a un campo de Converflow. Lo que dejes en{' '}
              <em>Ignorar</em> no se guarda.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {parsed.headers.map((h) => (
                <Field key={h} label={h} help={`Ej.: "${parsed.rows[0]?.[h] ?? ''}"`}>
                  <Select
                    value={targets[h] ?? IGNORE_KEY}
                    onChange={(e) => setTarget(h, e.target.value)}
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
            {missingMappingsRequired.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Falta mapear: <strong>{missingMappingsRequired.join(', ')}</strong>.
              </div>
            )}
          </section>
        </Card>
      )}

      {parsed && (
        <Card>
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h3 className="text-sm font-mono uppercase tracking-wider text-ink-500">
                2. Filas — edita lo que haga falta
              </h3>
              <div className="flex items-center gap-3 text-xs">
                <span className="rounded bg-green-100 px-2 py-0.5 font-medium text-green-800">
                  {validCount} {validCount === 1 ? 'lista' : 'listas'}
                </span>
                {errorCount > 0 && (
                  <span className="rounded bg-red-100 px-2 py-0.5 font-medium text-red-800">
                    {errorCount} con {errorCount === 1 ? 'error' : 'errores'}
                  </span>
                )}
                {errorCount > 0 && (
                  <label className="flex items-center gap-1.5 text-ink-600">
                    <input
                      type="checkbox"
                      checked={showOnlyErrors}
                      onChange={(e) => setShowOnlyErrors(e.target.checked)}
                      className="rounded border-ink-300 text-primary-600 focus:ring-primary-500"
                    />
                    Mostrar solo errores
                  </label>
                )}
              </div>
            </div>
            <p className="text-xs text-ink-500">
              Pincha cualquier celda para corregir el valor. La validación se actualiza al
              instante; las filas válidas se importan, las que no se quedan aquí.
            </p>
            <div className="overflow-x-auto rounded-md border border-ink-100">
              <table className="w-full text-xs">
                <thead className="bg-ink-100/50 text-ink-600">
                  <tr>
                    <th className="px-2 py-2 text-left font-mono">Fila</th>
                    <th className="px-2 py-2 text-left">Estado</th>
                    {parsed.headers.map((h) => (
                      <th key={h} className="px-2 py-2 text-left font-mono">
                        <div>{h}</div>
                        <div className="text-[10px] font-normal text-ink-500">
                          {targets[h] === IGNORE_KEY
                            ? '— ignorada —'
                            : targets[h]?.startsWith('cf:')
                            ? customFields.find((c) => c.key === targets[h]!.slice(3))?.label ??
                              targets[h]
                            : STANDARD_TARGETS.find((t) => t.key === targets[h])?.label ??
                              targets[h]}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const err: string | null = rowErrors[i] ?? null;
                    if (showOnlyErrors && err === null) return null;
                    return (
                      <tr
                        key={i}
                        className={`border-t border-ink-100 ${
                          err === null ? '' : 'bg-red-50/50'
                        }`}
                      >
                        <td className="px-2 py-1 align-top font-mono text-[11px] text-ink-500">
                          {i + 2}
                        </td>
                        <td className="px-2 py-1 align-top text-[11px]">
                          {err === null ? (
                            <span className="rounded bg-green-100 px-1.5 py-0.5 font-medium text-green-800">
                              ✓ Lista
                            </span>
                          ) : (
                            <div
                              className="max-w-[200px] rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-800"
                              title={err}
                            >
                              ⚠ {err.length > 60 ? `${err.slice(0, 58)}…` : err}
                            </div>
                          )}
                        </td>
                        {parsed.headers.map((h) => (
                          <td key={h} className="px-1 py-0.5 align-top">
                            {targets[h] === IGNORE_KEY ? (
                              <span className="block px-1 py-1 text-ink-400">
                                {row.values[h] || '—'}
                              </span>
                            ) : (
                              <Input
                                value={row.values[h] ?? ''}
                                onChange={(e) => setCell(i, h, e.target.value)}
                                className="!mt-0 !px-1.5 !py-1 !text-xs"
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={parsed.headers.length + 2} className="p-3 text-center text-ink-500">
                        No hay filas para importar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </Card>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          ✓ Importados: <strong>{result.imported}</strong>
          {result.errors.length > 0 && (
            <span className="text-amber-800">
              {' '}
              · {result.errors.length} con errores (puedes corregirlas arriba y volver a
              importar).
            </span>
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
          {result && result.errors.length === 0 ? 'Volver a leads' : 'Cancelar'}
        </button>
        {parsed && (
          <button
            type="button"
            disabled={
              pending ||
              missingMappingsRequired.length > 0 ||
              validCount === 0
            }
            onClick={doImport}
            className={buttonClass('primary')}
            title={
              missingMappingsRequired.length > 0
                ? `Falta mapear ${missingMappingsRequired.join(', ')}`
                : validCount === 0
                ? 'Corrige al menos una fila para importar'
                : ''
            }
          >
            {pending
              ? 'Importando…'
              : `Importar ${validCount} ${validCount === 1 ? 'fila' : 'filas'} listas`}
          </button>
        )}
      </div>

      {parsed && (
        <p className="text-[11px] text-ink-500">
          Estado acepta: <strong>Lead</strong> · <strong>Cliente</strong> ·{' '}
          <strong>Perdido</strong> (también alias en inglés: LEAD/NEW, CLIENT/WON, LOST).
        </p>
      )}
    </div>
  );
}
