'use client';

/**
 * Writing assistant inside the composer.
 *
 * Two jobs: draft from an instruction ("dile que aceptamos pero a 30 días"), and
 * rework what the user already typed. Everything lands in the editor for review
 * — nothing is ever sent from here.
 */

import { useState } from 'react';
import { Sparkles, Wand2, Scissors, Languages, X, AlertTriangle } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { aiErrorMessage } from './ai-error';

interface Variant {
  label: string;
  html: string;
}

const TONES = [
  { key: 'neutral', label: 'Neutro' },
  { key: 'formal', label: 'Formal' },
  { key: 'cercano', label: 'Cercano' },
];

const LENGTHS = [
  { key: 'corto', label: 'Corto' },
  { key: 'medio', label: 'Medio' },
  { key: 'largo', label: 'Largo' },
];

export function MailAssistant({
  threadId,
  connectionId,
  to,
  currentHtml,
  onApply,
  onSubject,
}: {
  /** Set for a reply; null when composing a new email. */
  threadId: string | null;
  /** Set when composing a new email. */
  connectionId: string | null;
  to?: string;
  currentHtml: string;
  onApply: (html: string) => void;
  onSubject?: (subject: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [tone, setTone] = useState('neutral');
  const [length, setLength] = useState('medio');
  const [variants, setVariants] = useState<Variant[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lo que el usuario ha escrito DE VERDAD, sin la firma que el compositor
  // inserta sola: sin esto, un "Mejorar" recién abierto le pasaría solo la firma
  // al modelo y podría reescribirla.
  const bodyWithoutSignature = currentHtml
    .replace(/<[^>]*>/g, ' ')
    .split('—')[0]!
    .replace(/&nbsp;/g, ' ')
    .trim();
  const hasText = bodyWithoutSignature.length >= 20;

  async function draft() {
    if (!instruction.trim()) return;
    setBusy('draft');
    setError(null);
    setVariants([]);
    try {
      const path = threadId
        ? `/mail/threads/${threadId}/ai/draft`
        : `/mail/connections/${connectionId}/ai/draft`;
      const r = await apiFetch<{ variants: Variant[]; subject: string }>(path, {
        method: 'POST',
        json: { instruction, tone, length, ...(threadId ? {} : { to }) },
      });
      setVariants(r.variants);
      if (r.subject && onSubject) onSubject(r.subject);
    } catch (err) {
      setError(aiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function refine(action: string, lang?: string) {
    setBusy(action);
    setError(null);
    try {
      const r = await apiFetch<{ html: string }>('/mail/ai/refine', {
        method: 'POST',
        json: { html: currentHtml, action, lang },
      });
      onApply(r.html);
    } catch (err) {
      setError(aiErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-primary-700 hover:underline"
      >
        <Sparkles size={12} /> Asistente IA
      </button>
    );
  }

  return (
    <div className="rounded-md border border-primary-200 bg-primary-50/50 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-900">
          <Sparkles size={12} /> Asistente IA
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-ink-400 hover:text-ink-700"
          aria-label="Cerrar asistente"
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex gap-1.5">
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void draft();
            }
          }}
          placeholder="Dile que aceptamos pero necesitamos pago a 30 días…"
          className="flex-1 rounded border border-ink-200 bg-white px-2 py-1 text-xs focus:border-ink-700 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void draft()}
          disabled={!instruction.trim() || busy !== null}
          className="shrink-0 rounded bg-ink-900 px-2.5 py-1 text-xs text-white hover:bg-ink-800 disabled:opacity-50"
        >
          {busy === 'draft' ? 'Redactando…' : 'Redactar'}
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
        <span className="inline-flex items-center gap-1">
          Tono:
          {TONES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTone(t.key)}
              className={`rounded px-1.5 py-0.5 ${tone === t.key ? 'bg-ink-900 text-white' : 'hover:bg-ink-200'}`}
            >
              {t.label}
            </button>
          ))}
        </span>
        <span className="inline-flex items-center gap-1">
          Largo:
          {LENGTHS.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setLength(l.key)}
              className={`rounded px-1.5 py-0.5 ${length === l.key ? 'bg-ink-900 text-white' : 'hover:bg-ink-200'}`}
            >
              {l.label}
            </button>
          ))}
        </span>
      </div>

      {/* Rework what is already typed. Hidden while the editor is empty. */}
      {hasText && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-primary-100 pt-2 text-[11px]">
          <span className="text-ink-500">Sobre lo escrito:</span>
          <button
            type="button"
            onClick={() => void refine('mejorar')}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-ink-700 hover:bg-ink-100 disabled:opacity-50"
          >
            <Wand2 size={10} /> {busy === 'mejorar' ? '…' : 'Mejorar'}
          </button>
          <button
            type="button"
            onClick={() => void refine('acortar')}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-ink-700 hover:bg-ink-100 disabled:opacity-50"
          >
            <Scissors size={10} /> {busy === 'acortar' ? '…' : 'Acortar'}
          </button>
          <button
            type="button"
            onClick={() => void refine('formal')}
            disabled={busy !== null}
            className="rounded bg-white px-1.5 py-0.5 text-ink-700 hover:bg-ink-100 disabled:opacity-50"
          >
            {busy === 'formal' ? '…' : 'Más formal'}
          </button>
          <button
            type="button"
            onClick={() => void refine('cercano')}
            disabled={busy !== null}
            className="rounded bg-white px-1.5 py-0.5 text-ink-700 hover:bg-ink-100 disabled:opacity-50"
          >
            {busy === 'cercano' ? '…' : 'Más cercano'}
          </button>
          <button
            type="button"
            onClick={() => void refine('traducir', 'en')}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-ink-700 hover:bg-ink-100 disabled:opacity-50"
          >
            <Languages size={10} /> {busy === 'traducir' ? '…' : 'Al inglés'}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-red-700">
          <AlertTriangle size={11} /> {error}
        </p>
      )}

      {variants.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-primary-100 pt-2">
          <p className="text-[11px] text-ink-500">
            Elige una versión — se pone en el editor y la revisas antes de enviar:
          </p>
          {variants.map((v, i) => (
            <div key={i} className="rounded border border-ink-200 bg-white p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-ink-700">{v.label}</span>
                <button
                  type="button"
                  onClick={() => {
                    onApply(v.html);
                    setVariants([]);
                  }}
                  className="shrink-0 rounded bg-primary-600 px-2 py-0.5 text-[11px] text-white hover:bg-primary-700"
                >
                  Usar esta
                </button>
              </div>
              <div
                className="max-h-32 overflow-y-auto text-xs text-ink-700 [&_p]:my-1"
                dangerouslySetInnerHTML={{ __html: v.html }}
              />
            </div>
          ))}
        </div>
      )}

      <p className="mt-1.5 text-[10px] text-ink-400">
        Redactado por IA · revísalo antes de enviar. Nunca se envía solo.
      </p>
    </div>
  );
}
