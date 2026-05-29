'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface Msg {
  id: string;
  direction: 'IN' | 'OUT';
  body: string | null;
  createdAt: string;
}

export function WebchatWidget({ botId }: { botId: string }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = `cf_webchat_session_${botId}`;
    let s = localStorage.getItem(key);
    if (!s) {
      s = crypto.randomUUID();
      localStorage.setItem(key, s);
    }
    setSessionId(s);
  }, [botId]);

  useEffect(() => {
    if (!sessionId) return;
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
    const t = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [sessionId, botId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function send() {
    const text = input.trim();
    if (!text || !sessionId) return;
    setInput('');
    setSending(true);
    setMessages((m) => [
      ...m,
      { id: `tmp-${Date.now()}`, direction: 'IN', body: text, createdAt: new Date().toISOString() },
    ]);
    try {
      await apiFetch(`/webchat/${botId}/messages`, { method: 'POST', json: { sessionId, text } });
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
        <div className="text-[11px] text-ink-500">Asistente de IA · puede cometer errores</div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto bg-ink-100/20 p-4">
        {messages.length === 0 && (
          <p className="text-sm text-ink-500">¿En qué podemos ayudarte?</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.direction === 'IN' ? 'justify-end' : 'justify-start'}`}>
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
            className="flex-1 resize-none rounded-md border-ink-300 text-sm focus:border-primary-500 focus:ring-primary-500"
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
    </div>
  );
}
