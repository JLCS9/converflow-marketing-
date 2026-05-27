import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge } from '@/components/ui/primitives';
import { NoteHistoryItem } from './history-item';

interface AnalyzedNote {
  id: string;
  body: string;
  authorId: string;
  createdAt: string;
  aiCategory: string;
  aiSentiment: string | null;
  aiConfidence: number | null;
  aiSuggestedReply: string | null;
  aiAnalyzedAt: string;
  lead: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
  opportunity: { id: string; name: string } | null;
}

const categoryLabel: Record<string, string> = {
  BUY_INTENT: 'Intención de compra',
  OBJECTION: 'Objeción',
  INFO_REQUEST: 'Pide info',
  COMPLAINT: 'Queja',
  SCHEDULING: 'Agendar',
  OFF_TOPIC: 'Off-topic',
  OTHER: 'Otro',
};

const categoryColor: Record<string, 'gray' | 'green' | 'yellow' | 'red' | 'blue'> = {
  BUY_INTENT: 'green',
  OBJECTION: 'yellow',
  INFO_REQUEST: 'blue',
  COMPLAINT: 'red',
  SCHEDULING: 'blue',
  OFF_TOPIC: 'gray',
  OTHER: 'gray',
};

export const metadata = { title: 'Historial IA' };

export default async function AiHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams({ limit: '200' });
  if (params.category) qs.set('category', params.category);

  const notes = await serverApiFetch<AnalyzedNote[]>(`/notes/analyzed?${qs.toString()}`);

  // Group by date (YYYY-MM-DD)
  const byDate = notes.reduce<Record<string, AnalyzedNote[]>>((acc, n) => {
    const day = n.aiAnalyzedAt.slice(0, 10);
    (acc[day] ??= []).push(n);
    return acc;
  }, {});

  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

  const categoryCounts = notes.reduce<Record<string, number>>((acc, n) => {
    acc[n.aiCategory] = (acc[n.aiCategory] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Historial IA</h1>
        <p className="mt-1 text-sm text-ink-500">
          Todas las notas que Claude ha clasificado, agrupadas por día. Despliega cada una para
          ver el mensaje original y la respuesta sugerida.
        </p>
      </header>

      <Card>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href="/app/ai-history"
            className={`rounded-full border px-3 py-1 ${!params.category ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 hover:border-ink-300'}`}
          >
            Todas ({notes.length})
          </Link>
          {Object.entries(categoryCounts).map(([cat, count]) => (
            <Link
              key={cat}
              href={`/app/ai-history?category=${cat}`}
              className={`rounded-full border px-3 py-1 ${params.category === cat ? 'border-ink-900 bg-ink-900 text-white' : 'border-ink-200 hover:border-ink-300'}`}
            >
              <Badge color={categoryColor[cat] ?? 'gray'}>{categoryLabel[cat] ?? cat}</Badge>
              <span className="ml-1 font-mono">{count}</span>
            </Link>
          ))}
        </div>
      </Card>

      {notes.length === 0 ? (
        <Card className="text-center text-ink-500">
          Aún no hay notas analizadas. Cuando analices una nota desde un lead, aparecerá aquí.
        </Card>
      ) : (
        dates.map((date) => (
          <section key={date} className="space-y-2">
            <h2 className="text-xs font-mono uppercase tracking-wider text-ink-500">
              {new Date(date).toLocaleDateString('es-ES', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
              <span className="ml-2 text-ink-400">({byDate[date]!.length})</span>
            </h2>
            <ul className="space-y-2">
              {byDate[date]!.map((n) => (
                <NoteHistoryItem
                  key={n.id}
                  note={n}
                  categoryLabel={categoryLabel[n.aiCategory] ?? n.aiCategory}
                  categoryColor={categoryColor[n.aiCategory] ?? 'gray'}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
