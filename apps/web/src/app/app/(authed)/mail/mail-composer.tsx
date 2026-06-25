'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { buttonClass } from '@/components/ui/primitives';
import { RichEmailEditor } from '@/components/ui/rich-email-editor';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export type ComposerMode = 'reply' | 'new' | 'forward';

export interface StagedAttachment {
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ComposerInitial {
  draftId?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  html?: string;
  attachments?: StagedAttachment[];
}

function humanSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const inputCls =
  'w-full rounded border border-ink-300 px-2 py-1 text-sm focus:border-ink-700 focus:outline-none';

/**
 * Unified email composer. Modes:
 * - reply: replies into an existing thread (To prefilled with the contact).
 * - new: brand-new email from the selected mailbox.
 * - forward: forwards a source message to new recipients.
 *
 * reply/new autosave a draft (debounced) and send via /mail/drafts/:id/send so
 * threading + lifecycle stay server-side. forward sends via the forward endpoint.
 */
export function MailComposer({
  mode,
  connectionId,
  threadId,
  forwardMessageId,
  initial,
  onSent,
  onClose,
}: {
  mode: ComposerMode;
  connectionId: string;
  threadId?: string;
  forwardMessageId?: string;
  initial?: ComposerInitial;
  onSent: () => void;
  onClose?: () => void;
}) {
  const [to, setTo] = useState(initial?.to ?? '');
  const [cc, setCc] = useState(initial?.cc ?? '');
  const [bcc, setBcc] = useState(initial?.bcc ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [html, setHtml] = useState(initial?.html ?? '');
  const [showCc, setShowCc] = useState(!!(initial?.cc || initial?.bcc));
  const [attached, setAttached] = useState<StagedAttachment[]>(initial?.attachments ?? []);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const draftIdRef = useRef<string | undefined>(initial?.draftId);
  const dirtyRef = useRef(false);

  const showSubject = mode !== 'reply';
  const canAutosave = mode === 'reply' || mode === 'new';
  const plain = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  const hasContent = !!(to.trim() || subject.trim() || plain || attached.length);

  const saveDraft = useCallback(async (): Promise<string | undefined> => {
    if (!canAutosave) return undefined;
    const body: Record<string, unknown> = {
      draftId: draftIdRef.current,
      to,
      cc,
      bcc,
      subject,
      html,
      attachments: attached,
    };
    if (mode === 'reply') body.threadId = threadId;
    else body.connectionId = connectionId;
    const r = await apiFetch<{ draftId: string; threadId: string }>('/mail/drafts', {
      method: 'POST',
      json: body,
    });
    draftIdRef.current = r.draftId;
    return r.draftId;
  }, [canAutosave, to, cc, bcc, subject, html, attached, mode, threadId, connectionId]);

  // Debounced autosave once the user has actually edited something.
  useEffect(() => {
    if (!canAutosave || !dirtyRef.current || !hasContent || busy) return;
    const t = setTimeout(() => {
      saveDraft()
        .then(() =>
          setSavedAt(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })),
        )
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [to, cc, bcc, subject, html, attached, canAutosave, hasContent, busy, saveDraft]);

  const touch = () => {
    dirtyRef.current = true;
  };

  async function onPickFiles(filesList: FileList | null) {
    if (!filesList || !filesList.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const f of Array.from(filesList)) {
        const fd = new FormData();
        fd.append('file', f);
        // Raw fetch: apiFetch can't do multipart (it forces JSON content-type).
        const res = await fetch(`${API_BASE}/mail/attachments/upload`, {
          method: 'POST',
          credentials: 'include',
          body: fd,
        });
        if (!res.ok) throw new Error('No se pudo subir el adjunto');
        const r = (await res.json()) as StagedAttachment;
        touch();
        setAttached((prev) => [...prev, r]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el adjunto');
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(storageKey: string) {
    touch();
    setAttached((prev) => prev.filter((a) => a.storageKey !== storageKey));
  }

  async function send() {
    if (!hasContent) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'forward') {
        if (!forwardMessageId) throw new Error('Falta el mensaje a reenviar');
        await apiFetch(`/mail/messages/${forwardMessageId}/forward`, {
          method: 'POST',
          json: { to, cc, bcc, html, attachments: attached },
        });
      } else {
        const id = (await saveDraft()) ?? draftIdRef.current;
        if (!id) throw new Error('No se pudo preparar el envío');
        await apiFetch(`/mail/drafts/${id}/send`, { method: 'POST' });
      }
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar');
    } finally {
      setBusy(false);
    }
  }

  async function discardDraft() {
    if (draftIdRef.current) {
      await apiFetch(`/mail/drafts/${draftIdRef.current}`, { method: 'DELETE' }).catch(() => {});
    }
    onClose?.();
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="w-12 shrink-0 text-xs text-ink-500">Para</label>
          <input
            className={inputCls}
            value={to}
            onChange={(e) => { touch(); setTo(e.target.value); }}
            placeholder="destinatario@dominio.com, otro@dominio.com"
          />
          {!showCc && (
            <button type="button" onClick={() => setShowCc(true)} className="shrink-0 text-xs text-primary-700 hover:underline">
              Cc/Cco
            </button>
          )}
        </div>
        {showCc && (
          <>
            <div className="flex items-center gap-2">
              <label className="w-12 shrink-0 text-xs text-ink-500">Cc</label>
              <input className={inputCls} value={cc} onChange={(e) => { touch(); setCc(e.target.value); }} placeholder="copia@dominio.com" />
            </div>
            <div className="flex items-center gap-2">
              <label className="w-12 shrink-0 text-xs text-ink-500">Cco</label>
              <input className={inputCls} value={bcc} onChange={(e) => { touch(); setBcc(e.target.value); }} placeholder="copia oculta@dominio.com" />
            </div>
          </>
        )}
        {showSubject && (
          <div className="flex items-center gap-2">
            <label className="w-12 shrink-0 text-xs text-ink-500">Asunto</label>
            <input className={inputCls} value={subject} onChange={(e) => { touch(); setSubject(e.target.value); }} placeholder="Asunto del correo" />
          </div>
        )}
      </div>

      <RichEmailEditor initialHtml={initial?.html} onChange={(h) => { touch(); setHtml(h); }} />

      {attached.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attached.map((a) => (
            <span key={a.storageKey} className="inline-flex items-center gap-1 rounded bg-ink-100 px-2 py-0.5 text-xs text-ink-700">
              📎 {a.filename} <span className="text-ink-400">({humanSize(a.sizeBytes)})</span>
              <button type="button" onClick={() => removeAttachment(a.storageKey)} className="text-ink-400 hover:text-red-600" aria-label="Quitar adjunto">✕</button>
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <label className={buttonClass('ghost', 'cursor-pointer text-xs')}>
            {uploading ? 'Subiendo…' : '📎 Adjuntar'}
            <input
              type="file"
              multiple
              className="hidden"
              disabled={uploading || busy}
              onChange={(e) => { void onPickFiles(e.target.files); e.currentTarget.value = ''; }}
            />
          </label>
          <span className="text-[11px] text-ink-400">
            {busy ? 'Enviando…' : savedAt ? `Borrador guardado ${savedAt}` : ''}
          </span>
        </div>
        <div className="flex gap-2">
          {onClose && (
            <button type="button" onClick={() => void discardDraft()} className={buttonClass('ghost', 'text-xs')} disabled={busy}>
              Descartar
            </button>
          )}
          <button type="button" onClick={() => void send()} disabled={busy || !hasContent} className={buttonClass('primary')}>
            {busy ? 'Enviando…' : mode === 'forward' ? 'Reenviar' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
