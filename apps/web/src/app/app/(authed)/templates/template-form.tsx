'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, buttonClass } from '@/components/ui/primitives';
import { RichEmailEditor } from '@/components/ui/rich-email-editor';

export interface TemplateData {
  id: string;
  name: string;
  subject: string | null;
  bodyHtml: string;
}

export function TemplateForm({ template }: { template?: TemplateData }) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? '');
  const [subject, setSubject] = useState(template?.subject ?? '');
  const [html, setHtml] = useState(template?.bodyHtml ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const payload = { name: name.trim(), subject: subject.trim() || undefined, bodyHtml: html };
        if (template) {
          await apiFetch(`/email-templates/${template.id}`, { method: 'PATCH', json: payload });
        } else {
          await apiFetch('/email-templates', { method: 'POST', json: payload });
        }
        router.push('/app/templates');
        router.refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Error inesperado');
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <div className="space-y-4">
          <Field label="Nombre" required help="Solo para identificarla internamente.">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Asunto" help="Opcional. Se rellena al usar la plantilla.">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </Field>
          <Field
            label="Cuerpo"
            required
            help="Variables: {nombre}, {first_name}, {email}, {telefono}. Se sustituyen al enviar."
          >
            <RichEmailEditor initialHtml={template?.bodyHtml} onChange={setHtml} />
          </Field>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => router.push('/app/templates')}
              className={buttonClass('secondary')}
              disabled={pending}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              className={buttonClass('primary')}
              disabled={pending || !name.trim() || !html.replace(/<[^>]*>/g, '').trim()}
            >
              {pending ? 'Guardando…' : template ? 'Guardar' : 'Crear plantilla'}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-mono uppercase tracking-wider text-ink-500">Vista previa</h3>
        {subject && <div className="mb-2 text-sm font-semibold">{subject}</div>}
        <div
          className="text-sm [&_a]:text-primary-700 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-ink-200 [&_blockquote]:pl-3 [&_p]:my-1 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_img]:max-w-full"
          dangerouslySetInnerHTML={{ __html: html || '<p class="text-ink-400">La vista previa aparecerá aquí…</p>' }}
        />
      </Card>
    </div>
  );
}
