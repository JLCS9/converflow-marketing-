'use client';

import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  CircleDot,
  MessageCircle,
  PhoneCall,
  ShoppingBag,
  Sparkles,
  Target,
  UserCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { statusLabel } from '@/lib/labels';
import { useLabelMaps, } from '@/lib/use-labels';
import type { LabelMaps } from '@/lib/label-maps';

/**
 * Contrato abierto del timeline. El backend deriva eventos de datos
 * existentes (GET /leads/:id/timeline); cualquier productor futuro (resúmenes
 * IA, etc.) solo tiene que emitir un `type` nuevo: los tipos desconocidos se
 * pintan con el fallback genérico sin tocar este componente.
 */
export interface TimelineEvent {
  type: string;
  date: string;
  source: string;
  payload: Record<string, unknown>;
}

interface EventMeta {
  icon: LucideIcon;
  tone: string; // clases del círculo del icono
  title: string;
  /** Línea secundaria específica del tipo; los renderers toleran payload incompleto. */
  detail?: (payload: Record<string, unknown>, maps: LabelMaps) => React.ReactNode;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function money(payload: Record<string, unknown>): string | null {
  const amount = str(payload.amount);
  if (!amount) return null;
  const n = Number(amount);
  const cur = str(payload.currency) ?? 'EUR';
  return Number.isFinite(n)
    ? n.toLocaleString('es-ES', { style: 'currency', currency: cur, maximumFractionDigits: 0 })
    : `${amount} ${cur}`;
}

/** Registro tipo → presentación. Añadir un tipo = añadir una entrada aquí (opcional: sin entrada usa el fallback). */
const EVENT_META: Record<string, EventMeta> = {
  created: {
    icon: Sparkles,
    tone: 'bg-blue-100 text-blue-700',
    title: 'Lead creado',
    detail: (p) => (str(p.channel) ? <span className="font-medium">{str(p.channel)}</span> : null),
  },
  contacted: { icon: PhoneCall, tone: 'bg-sky-100 text-sky-700', title: 'Primer contacto' },
  qualified: { icon: BadgeCheck, tone: 'bg-violet-100 text-violet-700', title: 'Cualificado' },
  converted: { icon: UserCheck, tone: 'bg-green-100 text-green-700', title: 'Convertido en cliente' },
  opportunity: {
    icon: Target,
    tone: 'bg-amber-100 text-amber-700',
    title: 'Oportunidad creada',
    detail: (p, maps) => {
      const id = str(p.opportunityId);
      const name = str(p.name) ?? 'Oportunidad';
      const status = str(p.status);
      return (
        <>
          {id ? (
            <Link href={`/app/opportunities/${id}`} className="text-primary-700 hover:underline">
              {name}
            </Link>
          ) : (
            name
          )}
          {status && <span className="ml-1.5 text-ink-400">· {statusLabel(maps.OPP_STATUS, status)}</span>}
        </>
      );
    },
  },
  purchase: {
    icon: ShoppingBag,
    tone: 'bg-emerald-100 text-emerald-700',
    title: 'Compra',
    detail: (p) => {
      const id = str(p.opportunityId);
      const name = str(p.name) ?? 'Oportunidad ganada';
      const amount = money(p);
      const refunded = str(p.refundedAt);
      return (
        <>
          {id ? (
            <Link href={`/app/opportunities/${id}`} className="text-primary-700 hover:underline">
              {name}
            </Link>
          ) : (
            <span className={refunded ? 'line-through decoration-ink-400' : undefined}>{name}</span>
          )}
          {amount && (
            <span
              className={`ml-1.5 font-medium ${refunded ? 'text-ink-400 line-through' : 'text-emerald-700'}`}
            >
              {amount}
            </span>
          )}
          {refunded && (
            <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
              Reembolsado
            </span>
          )}
        </>
      );
    },
  },
  conversation: {
    icon: MessageCircle,
    tone: 'bg-cyan-100 text-cyan-700',
    title: 'Conversación iniciada',
    detail: (p, maps) => {
      const channel = str(p.channel);
      // La bandeja no soporta deep-link por conversación todavía: enlazamos a la vista.
      return (
        <Link href="/app/conversations" className="text-primary-700 hover:underline">
          {channel ? statusLabel(maps.CHANNEL, channel) : '—'}
        </Link>
      );
    },
  },
};

/** Fallback genérico: tipos futuros se pintan como título humanizado + pares clave/valor. */
const FALLBACK_META: Omit<EventMeta, 'title'> = { icon: CircleDot, tone: 'bg-ink-100 text-ink-600' };

function humanize(type: string): string {
  const s = type.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fallbackDetail(payload: Record<string, unknown>): React.ReactNode {
  const entries = Object.entries(payload).filter(([, v]) => v != null && typeof v !== 'object');
  if (!entries.length) return null;
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join(' · ');
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LeadTimeline({ events }: { events: TimelineEvent[] }) {
  const t = useTranslations('leadCard');
  const maps = useLabelMaps();
  if (!events.length) {
    return <p className="text-sm text-ink-500">{t('noActivity')}</p>;
  }
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-ink-100">
      {events.map((ev, i) => {
        const meta = EVENT_META[ev.type];
        const Icon = (meta ?? FALLBACK_META).icon;
        const tone = (meta ?? FALLBACK_META).tone;
        const title = meta?.title ?? humanize(ev.type);
        const detail = meta?.detail ? meta.detail(ev.payload, maps) : fallbackDetail(ev.payload);
        return (
          <li key={`${ev.type}-${ev.date}-${i}`} className="relative flex gap-3">
            <span
              className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${tone}`}
            >
              <Icon size={14} />
            </span>
            <div className="min-w-0 pt-0.5">
              <div className="text-sm font-medium leading-tight text-ink-900">{title}</div>
              {detail && <div className="mt-0.5 break-words text-xs text-ink-600">{detail}</div>}
              <div className="mt-0.5 text-[11px] text-ink-400">{dateLabel(ev.date)}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
