'use client';

/**
 * Barra de filtros de contactos. Todo vive en la URL (router.replace con
 * searchParams), así que cualquier combinación es compartible: pegar el enlace
 * reproduce exactamente la vista.
 */

import { useCallback, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, X } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { LEAD_STATUS_OPTIONS } from '@/lib/labels';

export interface OwnerOption {
  id: string;
  name: string;
}

const selectCls =
  'rounded-md border border-ink-200 bg-white py-1.5 pl-2 pr-8 text-xs text-ink-700 focus:border-ink-700 focus:outline-none disabled:opacity-40';

export function ContactsFilters({ owners }: { owners: OwnerOption[] }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Los filtros de origen/responsable/score son de lead: con estado=Cliente no
  // aplican y se deshabilitan en vez de fingir que filtran.
  const leadOnly = params.get('status') === 'CLIENT';

  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      next.delete('page'); // cambiar un filtro vuelve a la primera página
      router.replace(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  const debouncedSearch = (v: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => set({ search: v.trim() || null }), 350);
  };

  const hasAny = ['status', 'source', 'ownerId', 'createdFrom', 'createdTo', 'scoreMin', 'search'].some(
    (k) => params.get(k),
  );

  // El Estado define el tipo de contacto: Lead / Cliente / Perdido. Nada más —
  // los subestados de Client (activo/inactivo/archivado) viven en su ficha.
  const statusOptions: [string, string][] = LEAD_STATUS_OPTIONS.map((o) => [o.value, o.label]);

  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={params.get('status') ?? ''}
          onChange={(e) => set({ status: e.target.value || null })}
          className={selectCls}
          aria-label={t('crm.status')}
        >
          <option value="">{t('crm.status')}: {t('crm.all').toLowerCase()}</option>
          {statusOptions.map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <input
          defaultValue={params.get('source') ?? ''}
          onChange={(e) => set({ source: e.target.value.trim() || null })}
          placeholder={t('crm.source')}
          disabled={leadOnly}
          title={leadOnly ? t('contacts.leadOnlyFilter') : undefined}
          className={`${selectCls} w-28`}
        />

        <select
          value={params.get('ownerId') ?? ''}
          onChange={(e) => set({ ownerId: e.target.value || null })}
          disabled={leadOnly}
          title={leadOnly ? t('contacts.leadOnlyFilter') : undefined}
          className={selectCls}
          aria-label={t('crm.owner')}
        >
          <option value="">{t('crm.owner')}: {t('crm.all').toLowerCase()}</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-1 text-xs text-ink-500">
          {t('contacts.createdBetween')}
          <input
            type="date"
            value={params.get('createdFrom') ?? ''}
            onChange={(e) => set({ createdFrom: e.target.value || null })}
            className={selectCls}
          />
          –
          <input
            type="date"
            value={params.get('createdTo') ?? ''}
            onChange={(e) => set({ createdTo: e.target.value || null })}
            className={selectCls}
          />
        </label>

        <input
          type="number"
          min={0}
          max={100}
          defaultValue={params.get('scoreMin') ?? ''}
          onChange={(e) => set({ scoreMin: e.target.value || null })}
          placeholder="Score ≥"
          disabled={leadOnly}
          title={leadOnly ? t('contacts.leadOnlyFilter') : undefined}
          className={`${selectCls} w-20`}
        />

        <div className="relative min-w-[180px] flex-1">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            defaultValue={params.get('search') ?? ''}
            onChange={(e) => debouncedSearch(e.target.value)}
            placeholder={t('leads.searchPlaceholder')}
            className={`${selectCls} w-full pl-7`}
          />
        </div>

        {hasAny && (
          <button
            type="button"
            onClick={() => router.replace(pathname)}
            className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-800"
          >
            <X size={12} /> {t('contacts.clearFilters')}
          </button>
        )}
      </div>
    </Card>
  );
}
