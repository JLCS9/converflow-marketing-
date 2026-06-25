'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';

interface Msg {
  id: string;
  direction: 'IN' | 'OUT';
  body: string | null;
  createdAt: string;
}

interface Visitor {
  name: string;
  email: string;
}

const SESSION_KEY = (botId: string) => `cf_webchat_session_${botId}`;
const VISITOR_KEY = (botId: string) => `cf_webchat_visitor_${botId}`;

export function WebchatWidget({ botId }: { botId: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // Intake form state (only used until visitor is set).
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);

  // Init: session + visitor from localStorage.
  useEffect(() => {
    try {
      let s = localStorage.getItem(SESSION_KEY(botId));
      if (!s) {
        s = crypto.randomUUID();
        localStorage.setItem(SESSION_KEY(botId), s);
      }
      setSessionId(s);
      const raw = localStorage.getItem(VISITOR_KEY(botId));
      if (raw) {
        const v = JSON.parse(raw) as Visitor;
        if (v?.name && v?.email) setVisitor(v);
      }
    } catch {
      /* storage disabled — fall through to intake form each time */
    }
  }, [botId]);

  // Poll messages once visitor + session are ready.
  useEffect(() => {
    if (!sessionId || !visitor) return;
    let active = true;
    const poll = async () => {
      try {
        const r = await apiFetch<{ messages: Msg[] }>(
          `/webchat/${botId}/messages?sessionId=${encodeURIComponent(sessionId)}`,
        );
        if (active) setMessages(r.messages);
      } catch {
        /* keep last */
      }
    };
    void poll();
    const t = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [sessionId, botId, visitor]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function submitIntake(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sessionId) return;
    const name = formName.trim();
    const email = formEmail.trim().toLowerCase();
    if (!name) return setFormError('Indícanos tu nombre');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setFormError('Email no válido');
    setFormError(null);
    setFormBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; reason?: string }>(
        `/webchat/${botId}/start`,
        { method: 'POST', json: { sessionId, name, email } },
      );
      if (!res?.ok) {
        setFormError('Este chat no está disponible.');
        return;
      }
      const v: Visitor = { name, email };
      setVisitor(v);
      try {
        localStorage.setItem(VISITOR_KEY(botId), JSON.stringify(v));
      } catch {
        /* ignore */
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'No se pudo iniciar el chat');
    } finally {
      setFormBusy(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || !sessionId || !visitor) return;
    setInput('');
    setSending(true);
    setMessages((m) => [
      ...m,
      { id: `tmp-${Date.now()}`, direction: 'IN', body: text, createdAt: new Date().toISOString() },
    ]);
    try {
      await apiFetch(`/webchat/${botId}/messages`, {
        method: 'POST',
        json: {
          sessionId,
          text,
          visitorName: visitor.name,
          visitorEmail: visitor.email,
        },
      });
    } catch {
      /* the poll will reconcile */
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      <div className="shrink-0 border-b border-ink-100 px-4 py-3">
        <div className="font-semibold tracking-tight">
          Chat<span className="text-primary-600"> en vivo</span>
        </div>
        <div className="text-[11px] text-ink-500">
          Asistente de IA · puede cometer errores
        </div>
      </div>

      {!visitor ? (
        <form
          onSubmit={submitIntake}
          className="flex flex-1 flex-col justify-center gap-3 bg-ink-100/20 p-6"
        >
          <div>
            <h2 className="text-lg font-semibold tracking-tight">¡Hola! 👋</h2>
            <p className="mt-1 text-sm text-ink-500">
              Antes de empezar, déjanos tu nombre y email para poder seguir
              la conversación si se cae la conexión.
            </p>
          </div>
          <div
            role="note"
            aria-label="Aviso de uso de IA"
            className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
          >
            <strong>Asistente de IA.</strong> Vas a hablar con un asistente
            de inteligencia artificial. Puede cometer errores; si necesitas
            ayuda de una persona, pídelo en el chat y te derivamos.
          </div>
          <label className="block">
            <span className="text-xs text-ink-500">Nombre</span>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              autoFocus
              maxLength={150}
              className="mt-1 block w-full rounded-md border border-ink-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-500">Email</span>
            <input
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              required
              maxLength={254}
              className="mt-1 block w-full rounded-md border border-ink-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </label>
          {formError && <p className="text-xs text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={formBusy}
            className="rounded-md bg-ink-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-700 disabled:opacity-60"
          >
            {formBusy ? 'Conectando…' : 'Empezar chat'}
          </button>
          <p className="text-[10px] text-ink-400">
            Al continuar aceptas que guardemos esta conversación para responderte.
          </p>
        </form>
      ) : (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto bg-ink-100/20 p-4">
            {messages.length === 0 && (
              <p className="text-sm text-ink-500">
                Hola {visitor.name.split(' ')[0]}, ¿en qué podemos ayudarte?
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.direction === 'IN' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                    m.direction === 'IN'
                      ? 'bg-primary-600 text-white'
                      : 'border border-ink-100 bg-white text-ink-900'
                  }`}
                >
                  {m.body}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="shrink-0 border-t border-ink-100 p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="Escribe un mensaje…"
                className="flex-1 resize-none rounded-md border border-ink-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || !input.trim()}
                className="rounded-md bg-ink-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-ink-700 disabled:opacity-60"
              >
                Enviar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
