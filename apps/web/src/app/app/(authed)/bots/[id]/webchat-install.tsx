'use client';

import { useState } from 'react';
import { Card, buttonClass } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/copy-button';

interface Props {
  botId: string;
  appUrl: string; // e.g., https://app.converflow.ai
}

/**
 * Two install paths for the embeddable web-chat widget:
 *
 *  1. Floating bubble (recommended). A single <script> tag that auto-injects a
 *     toggleable chat button on the bottom-right of every page. Tenants paste
 *     this once into their <head> / <body> closing tag.
 *  2. Inline iframe. For users who want the widget anchored in a specific
 *     part of the page (e.g., a "Contact" section).
 */
export function WebchatInstall({ botId, appUrl }: Props) {
  const [tab, setTab] = useState<'bubble' | 'inline'>('bubble');

  const widgetUrl = `${appUrl}/widget/${botId}`;

  const bubbleSnippet = `<!-- converflow.ai Web Chat -->
<script>
(function(){
  var d=document, b=d.body;
  if(!b){d.addEventListener('DOMContentLoaded',arguments.callee);return;}
  var ifr=d.createElement('iframe');
  ifr.src='${widgetUrl}';
  ifr.title='Chat en vivo';
  ifr.style.cssText='position:fixed;bottom:90px;right:20px;width:380px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 120px);border:0;border-radius:16px;box-shadow:0 12px 36px rgba(15,23,42,.18);z-index:2147483646;display:none;background:#fff;';
  var btn=d.createElement('button');
  btn.type='button';
  btn.setAttribute('aria-label','Abrir chat');
  btn.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  btn.style.cssText='position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;background:#2563eb;color:#fff;border:0;cursor:pointer;box-shadow:0 6px 20px rgba(37,99,235,.45);z-index:2147483647;display:flex;align-items:center;justify-content:center;';
  btn.addEventListener('click',function(){
    var open=ifr.style.display==='block';
    ifr.style.display=open?'none':'block';
    btn.setAttribute('aria-label',open?'Abrir chat':'Cerrar chat');
    if(!open){setTimeout(function(){try{ifr.contentWindow.focus()}catch(e){}},150);}
  });
  b.appendChild(ifr); b.appendChild(btn);
})();
</script>`;

  const inlineSnippet = `<!-- converflow.ai Web Chat (inline) -->
<iframe
  src="${widgetUrl}"
  title="Chat en vivo"
  style="width:100%;max-width:420px;height:600px;border:0;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.08);background:#fff;"
></iframe>`;

  const current = tab === 'bubble' ? bubbleSnippet : inlineSnippet;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-mono uppercase tracking-wider text-ink-500">
            Instalar Web Chat
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            Pega el snippet en el HTML de tu web. El visitante verá un formulario para dejar
            nombre y email antes de empezar — las conversaciones aparecen automáticamente en{' '}
            <a href="/app/conversations" className="text-primary-700 hover:underline">
              Conversaciones
            </a>
            .
          </p>
        </div>
        <a
          href={widgetUrl}
          target="_blank"
          rel="noreferrer"
          className={buttonClass('secondary', 'text-xs')}
        >
          Probar widget
        </a>
      </div>

      <div className="mt-4 inline-flex rounded-md border border-ink-100 bg-ink-100/40 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setTab('bubble')}
          className={`rounded px-3 py-1.5 font-medium transition-colors ${
            tab === 'bubble' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900'
          }`}
        >
          🟢 Burbuja flotante (recomendado)
        </button>
        <button
          type="button"
          onClick={() => setTab('inline')}
          className={`rounded px-3 py-1.5 font-medium transition-colors ${
            tab === 'inline' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900'
          }`}
        >
          📐 iframe inline
        </button>
      </div>

      {tab === 'bubble' ? (
        <p className="mt-3 text-xs text-ink-500">
          Pégalo justo antes de <code className="rounded bg-ink-100 px-1">&lt;/body&gt;</code> en
          cada página donde quieras el chat (o en tu plantilla principal). Aparecerá un botón en
          la esquina inferior derecha que abre/cierra el chat.
        </p>
      ) : (
        <p className="mt-3 text-xs text-ink-500">
          Pégalo donde quieras el chat anclado (por ejemplo en una sección de "Contacto"). El
          tamaño es ajustable cambiando los estilos <code>width</code> y <code>height</code>.
        </p>
      )}

      <div className="relative mt-3">
        <pre className="max-h-[260px] overflow-auto rounded-md border border-ink-100 bg-ink-900 p-3 text-[11px] leading-relaxed text-ink-100">
          <code>{current}</code>
        </pre>
        <div className="absolute right-2 top-2">
          <CopyButton value={current} label="Copiar snippet" />
        </div>
      </div>

      <details className="mt-3 text-xs text-ink-500">
        <summary className="cursor-pointer">Detalles técnicos</summary>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            URL del widget:{' '}
            <code className="font-mono text-[11px]">{widgetUrl}</code>
          </li>
          <li>
            Asegúrate de tener un <strong>agente IA asignado</strong> a este bot abajo para que
            responda automáticamente.
          </li>
          <li>
            Las conversaciones quedan vinculadas a un Lead (con nombre y email) — visibles en{' '}
            <a href="/app/leads" className="text-primary-700 hover:underline">Leads</a> y{' '}
            <a href="/app/conversations" className="text-primary-700 hover:underline">
              Conversaciones
            </a>
            .
          </li>
          <li>
            El visitante guarda su sesión en localStorage del navegador: si vuelve, no le pedimos
            otra vez el nombre y email.
          </li>
        </ul>
      </details>
    </Card>
  );
}
