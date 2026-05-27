'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface Entity {
  id: string;
  name: string;
  email?: string | null;
  company?: string | null;
}

interface EntityPickerProps {
  endpoint: string; // '/leads' | '/clients'
  name: string; // hidden input name (e.g., 'leadId')
  label: string;
  defaultId?: string;
  defaultName?: string;
  placeholder?: string;
  required?: boolean;
  searchParam?: string; // defaults to 'search'
}

/**
 * Search-by-name picker. Hits `${endpoint}?search=<query>` and lets the user
 * pick from the matches; the underlying hidden input carries the id.
 *
 * Designed to replace raw "paste-an-id" inputs when the user shouldn't know
 * about cuid strings.
 */
export function EntityPicker({
  endpoint,
  name,
  label,
  defaultId,
  defaultName,
  placeholder = 'Buscar por nombre…',
  required,
  searchParam = 'search',
}: EntityPickerProps) {
  const [selected, setSelected] = useState<Entity | null>(
    defaultId && defaultName ? { id: defaultId, name: defaultName } : null,
  );
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Entity[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch on query change, debounced.
  useEffect(() => {
    if (selected) return; // user has a selection, don't search until they clear
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ [searchParam]: query.trim(), limit: '10' });
        const items = await apiFetch<Entity[]>(`${endpoint}?${qs.toString()}`);
        setResults(items);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selected, endpoint, searchParam]);

  if (selected) {
    return (
      <label className="block">
        <span className="text-sm font-medium text-ink-900">{label}</span>
        <input type="hidden" name={name} value={selected.id} />
        <div className="mt-1 flex items-center justify-between rounded-md border border-ink-300 bg-ink-100/40 px-3 py-2 text-sm">
          <span>
            <strong>{selected.name}</strong>
            {selected.company && <span className="text-ink-500"> — {selected.company}</span>}
            {selected.email && <span className="ml-1 font-mono text-xs text-ink-500">{selected.email}</span>}
          </span>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery('');
            }}
            className="text-xs text-red-600 hover:underline"
          >
            Quitar
          </button>
        </div>
      </label>
    );
  }

  return (
    <label className="relative block">
      <span className="text-sm font-medium text-ink-900">{label}</span>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className="mt-1 w-full rounded-md border-ink-300"
      />
      {/* Hidden input — only stores id when one is selected */}
      <input type="hidden" name={name} value="" />
      {open && (results.length > 0 || loading) && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-ink-200 bg-white text-sm shadow-lg">
          {loading && <li className="px-3 py-2 text-ink-500">Buscando…</li>}
          {!loading &&
            results.map((r) => (
              <li
                key={r.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSelected(r);
                  setOpen(false);
                }}
                className="cursor-pointer px-3 py-2 hover:bg-primary-50"
              >
                <div className="font-medium">{r.name}</div>
                {(r.company || r.email) && (
                  <div className="text-xs text-ink-500">
                    {r.company}
                    {r.company && r.email ? ' · ' : ''}
                    {r.email}
                  </div>
                )}
              </li>
            ))}
          {!loading && results.length === 0 && query.length >= 2 && (
            <li className="px-3 py-2 text-ink-500">Sin resultados.</li>
          )}
        </ul>
      )}
      {query.length > 0 && query.length < 2 && (
        <p className="mt-1 text-xs text-ink-500">Escribe al menos 2 caracteres.</p>
      )}
    </label>
  );
}
