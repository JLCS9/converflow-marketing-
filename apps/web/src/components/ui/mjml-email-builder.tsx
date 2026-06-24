'use client';

import { useEffect, useRef } from 'react';
import 'grapesjs/dist/css/grapes.min.css';

const DEFAULT_MJML =
  '<mjml><mj-body><mj-section><mj-column>' +
  '<mj-text font-size="16px" color="#1a1a1a">Escribe aquí tu mensaje…</mj-text>' +
  '</mj-column></mj-section></mj-body></mjml>';

/**
 * Drag-and-drop email builder (GrapesJS + MJML preset). Outputs MJML source
 * (for re-editing) and compiled responsive HTML (for sending) via onChange.
 * GrapesJS touches `window`/`document`, so it's imported dynamically inside the
 * effect (SSR-safe). CSS is a static import (extracted by the bundler).
 */
export function MjmlEmailBuilder({
  initialMjml,
  onChange,
}: {
  initialMjml?: string;
  onChange: (v: { mjml: string; html: string }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialRef = useRef(initialMjml);

  useEffect(() => {
    let editor: { destroy: () => void; on: (e: string, cb: () => void) => void; getHtml: () => string; runCommand: (c: string) => unknown } | undefined;
    let destroyed = false;

    void (async () => {
      const grapesjs = (await import('grapesjs')).default;
      // grapesjs-mjml has no types
      const mjmlPlugin = (await import('grapesjs-mjml')).default as unknown;
      if (destroyed || !containerRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ed = (grapesjs as any).init({
        container: containerRef.current,
        height: '640px',
        width: 'auto',
        fromElement: false,
        storageManager: false,
        plugins: [mjmlPlugin],
        components: initialRef.current || DEFAULT_MJML,
      }) as NonNullable<typeof editor>;
      editor = ed;

      const emit = () => {
        try {
          const res = ed.runCommand('mjml-get-code') as { html?: string } | string | undefined;
          const html = (typeof res === 'string' ? res : res?.html) ?? '';
          onChangeRef.current({ mjml: ed.getHtml(), html });
        } catch {
          /* MJML can be transiently invalid mid-edit — ignore */
        }
      };
      ed.on('update', emit);
      ed.on('component:update', emit);
      ed.on('load', emit);
      setTimeout(emit, 400);
    })();

    return () => {
      destroyed = true;
      try {
        editor?.destroy();
      } catch {
        /* ignore */
      }
    };
    // Init once on mount; initial value captured via ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="overflow-hidden rounded-md border border-ink-200" ref={containerRef} />;
}
