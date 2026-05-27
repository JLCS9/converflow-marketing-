'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/copy-button';

interface Note {
  id: string;
  body: string;
  createdAt: string;
  aiSentiment: string | null;
  aiConfidence: number | null;
  aiSuggestedReply: string | null;
  aiAnalyzedAt: string;
  lead: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
  opportunity: { id: string; name: string } | null;
}

const sentimentEmoji: Record<string, string> = {
  POSITIVE: '😊',
  NEUTRAL: '😐',
  NEGATIVE: '😟',
  URGENT: '🚨',
};

export function NoteHistoryItem({
  note,
  categoryLabel,
  categoryColor,
}: {
  note: Note;
  categoryLabel: string;
  categoryColor: 'gray' | 'green' | 'yellow' | 'red' | 'blue';
}) {
  const [open, setOpen] = useState(false);
  const preview = note.body.length > 120 ? note.body.slice(0, 120) + '…' : note.body;

  const linkedEntity = note.lead
    ? { href: `/app/leads/${note.lead.id}`, label: `Lead: ${note.lead.name}` }
    : note.client
      ? { href: `/app/clients/${note.client.id}`, label: `Cliente: ${note.client.name}` }
      : note.opportunity
        ? { href: `/app/opportunities/${note.opportunity.id}`, label: `Op: ${note.opportunity.name}` }
        : null;

  return (
    <li className="rounded-lg border border-ink-100 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left text-sm hover:bg-ink-100/30"
      >
        <span className="shrink-0 font-mono text-xs text-ink-500">
          {new Date(note.aiAnalyzedAt).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
        <Badge color={categoryColor}>{categoryLabel}</Badge>
        {note.aiSentiment && (
          <span className="font-mono text-xs">
            {sentimentEmoji[note.aiSentiment] ?? ''} {note.aiSentiment}
          </span>
        )}
        {linkedEntity && (
          <span className="truncate text-xs text-ink-500" onClick={(e) => e.stopPropagation()}>
            <Link href={linkedEntity.href} className="text-primary-700 hover:underline">
              {linkedEntity.label}
            </Link>
          </span>
        )}
        <span className="flex-1 truncate text-ink-700">{preview}</span>
        <span className="shrink-0 text-ink-400">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-ink-100 px-4 pb-4 pt-3 text-sm">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
              Mensaje original
            </div>
            <p className="mt-1 whitespace-pre-wrap text-ink-900">{note.body}</p>
          </div>
          {note.aiSuggestedReply && (
            <div>
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-ink-500">
                Respuesta sugerida
                {note.aiConfidence != null && (
                  <span className="font-sans normal-case">
                    (confianza {Math.round(note.aiConfidence * 100)}%)
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-start gap-2">
                <code className="flex-1 whitespace-pre-wrap rounded border border-ink-200 bg-ink-100/40 px-3 py-2 font-sans text-ink-900">
                  {note.aiSuggestedReply}
                </code>
                <CopyButton value={note.aiSuggestedReply} />
              </div>
            </div>
          )}
          <div className="flex justify-end text-xs text-ink-500">
            Creada {new Date(note.createdAt).toLocaleString('es-ES')}
            {note.createdAt !== note.aiAnalyzedAt && (
              <>
                {' · '}analizada {new Date(note.aiAnalyzedAt).toLocaleString('es-ES')}
              </>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
