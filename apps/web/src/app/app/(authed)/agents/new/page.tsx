import Link from 'next/link';
import { AgentForm, type AgentType } from '../agent-form';

export const metadata = { title: 'Nuevo agente' };

const ALLOWED: AgentType[] = ['CONVERSATIONAL', 'SCORING', 'TRIAGE'];

interface TypeCard {
  type: AgentType;
  title: string;
  emoji: string;
  description: string;
  example: string;
  disabled?: boolean;
}

const TYPE_CARDS: TypeCard[] = [
  {
    type: 'CONVERSATIONAL',
    title: 'Conversacional',
    emoji: '💬',
    description:
      'Responde mensajes que llegan por WhatsApp, Email o Web Chat. Se asigna a un Bot.',
    example: 'Atender preguntas de horarios, capturar leads del chat, agendar reuniones.',
  },
  {
    type: 'SCORING',
    title: 'Scoring',
    emoji: '✨',
    description:
      'Procesa leads en masa: les pone un score, decide su estado y crea oportunidades según las reglas que tú definas.',
    example:
      'Importas 150 leads del colegio y lanzas el agente: marca cada uno como Lead / Cliente / Perdido y crea la oportunidad de admisión.',
  },
  {
    type: 'TRIAGE',
    title: 'Triage',
    emoji: '🧭',
    description:
      'Clasifica mensajes entrantes y los rutea al responsable según el producto/área. Runtime en construcción.',
    example: 'Próximamente.',
    disabled: true,
  },
];

/**
 * Two-step new-agent flow:
 *  Step 1 (no ?type): pick a type via cards. Each card links to step 2.
 *  Step 2 (?type=X):  show only the form for that type — fully focused.
 */
export default async function NewAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const validType =
    type && (ALLOWED as string[]).includes(type) ? (type as AgentType) : null;

  if (!validType) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/app/agents" className="text-sm text-ink-500 hover:text-ink-900">
            ← Volver a agentes
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo agente</h1>
          <p className="mt-1 text-sm text-ink-500">
            ¿Qué tipo de agente quieres crear? Cada tipo tiene su propio formulario y
            su propia forma de invocarse.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-1">
          {TYPE_CARDS.map((card) => {
            const Inner = (
              <div
                className={`group flex items-start gap-4 rounded-lg border bg-white p-5 transition-colors ${
                  card.disabled
                    ? 'cursor-not-allowed border-ink-100 opacity-60'
                    : 'border-ink-100 hover:border-primary-400 hover:bg-primary-50/30'
                }`}
              >
                <span className="text-3xl" aria-hidden>
                  {card.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-base font-semibold text-ink-900">{card.title}</h2>
                    {card.disabled && (
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-500">
                        Próximamente
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-ink-700">{card.description}</p>
                  <p className="mt-2 text-xs italic text-ink-500">
                    Ejemplo: {card.example}
                  </p>
                </div>
                {!card.disabled && (
                  <span
                    aria-hidden
                    className="self-center text-ink-300 transition-colors group-hover:text-primary-600"
                  >
                    →
                  </span>
                )}
              </div>
            );
            if (card.disabled) return <div key={card.type}>{Inner}</div>;
            return (
              <Link
                key={card.type}
                href={`/app/agents/new?type=${card.type}`}
                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-lg"
              >
                {Inner}
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  // Step 2 — form filtered to the chosen type.
  const headers: Record<AgentType, { title: string; description: string }> = {
    CONVERSATIONAL: {
      title: 'Nuevo agente conversacional',
      description:
        'Define cómo habla con los clientes y qué herramientas puede usar. Luego lo asignas a un Bot.',
    },
    SCORING: {
      title: 'Nuevo agente de Scoring',
      description:
        'Escribe las reglas del funnel (qué es un cliente, qué es perdido, qué oportunidad crear). Después lanzas el batch desde la lista de Leads.',
    },
    TRIAGE: {
      title: 'Nuevo agente de Triage',
      description: 'Próximamente.',
    },
  };
  const h = headers[validType];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/app/agents/new" className="text-sm text-ink-500 hover:text-ink-900">
          ← Cambiar tipo
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{h.title}</h1>
        <p className="mt-1 text-sm text-ink-500">{h.description}</p>
      </div>
      <AgentForm initialType={validType} lockType />
    </div>
  );
}
