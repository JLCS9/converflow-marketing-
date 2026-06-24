'use client';

import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { RichEmailEditor } from '@/components/ui/rich-email-editor';
import { TemplatePicker } from '@/components/ui/template-picker';
import { Field, Input, buttonClass } from '@/components/ui/primitives';

export function ComposeEmailModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: (conversationId: string) => void;
}) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [initialHtml, setInitialHtml] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    setSending(true);
    try {
      const res = await apiFetch<{ conversationId: string }>('/conversations/compose', {
        method: 'POST',
        json: { to: to.trim(), subject: subject.trim(), html },
      });
      onSent(res.conversationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-ink-100 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
          <h2 className="text-base font-semibold">Nuevo correo</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700" aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="space-y-4 p-5">
          <Field label="Para" required>
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="cliente@empresa.com"
            />
          </Field>
          <Field label="Asunto" required>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Mensaje" required>
            <div className="mb-2 flex justify-end">
              <TemplatePicker
                onPick={(t) => {
                  if (t.subject) setSubject(t.subject);
                  setInitialHtml(t.bodyHtml);
                  setHtml(t.bodyHtml);
                  setEditorKey((k) => k + 1);
                }}
              />
            </div>
            <RichEmailEditor key={editorKey} initialHtml={initialHtml} onChange={setHtml} />
          </Field>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3">
          <button onClick={onClose} className={buttonClass('secondary')} disabled={sending}>
            Cancelar
          </button>
          <button
            onClick={() => void send()}
            className={buttonClass('primary')}
            disabled={sending || !to.trim() || !subject.trim()}
          >
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
