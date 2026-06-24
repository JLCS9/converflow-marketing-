'use client';

import { useEffect, useRef } from 'react';
import 'grapesjs/dist/css/grapes.min.css';
import './grapesjs-theme.css';

const DEFAULT_MJML =
  '<mjml><mj-body background-color="#f4f4f5">' +
  '<mj-section background-color="#ffffff" padding="24px">' +
  '<mj-column>' +
  '<mj-text font-size="16px" color="#1a1a1a" line-height="1.5">Escribe aquí tu mensaje…</mj-text>' +
  '</mj-column></mj-section></mj-body></mjml>';

// Spanish labels for the MJML preset blocks (default labels are English/terse).
const BLOCK_LABELS: Record<string, string> = {
  'mj-1-column': '1 Columna',
  'mj-2-columns': '2 Columnas',
  'mj-3-columns': '3 Columnas',
  'mj-text': 'Texto',
  'mj-image': 'Imagen',
  'mj-button': 'Botón',
  'mj-divider': 'Separador',
  'mj-spacer': 'Espacio',
  'mj-social-group': 'Redes sociales',
  'mj-social-element': 'Red social',
  'mj-navbar': 'Menú',
  'mj-hero': 'Cabecera',
  'mj-wrapper': 'Contenedor',
  'mj-section': 'Sección',
  'mj-column': 'Columna',
};

/**
 * Drag-and-drop email builder (GrapesJS + MJML preset). Emits the MJML source
 * via onChange; the server compiles it to responsive HTML on save. GrapesJS
 * touches window/document, so it's imported dynamically (SSR-safe).
 */
export function MjmlEmailBuilder({
  initialMjml,
  onChange,
}: {
  initialMjml?: string;
  onChange: (v: { mjml: string }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialRef = useRef(initialMjml);

  useEffect(() => {
    let editor: { destroy: () => void } | undefined;
    let destroyed = false;

    void (async () => {
      const grapesjs = (await import('grapesjs')).default;
      const mjmlPlugin = (await import('grapesjs-mjml')).default as unknown;
      if (destroyed || !containerRef.current) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ed: any = (grapesjs as any).init({
        container: containerRef.current,
        height: '70vh',
        width: 'auto',
        fromElement: false,
        storageManager: false,
        plugins: [mjmlPlugin],
        deviceManager: {
          devices: [
            { id: 'desktop', name: 'Escritorio', width: '' },
            { id: 'mobile', name: 'Móvil', width: '375px', widthMedia: '480px' },
          ],
        },
        components: initialRef.current || DEFAULT_MJML,
      });
      editor = ed;

      // Relabel the blocks in Spanish for a clearer panel.
      try {
        const bm = ed.BlockManager;
        for (const [id, label] of Object.entries(BLOCK_LABELS)) {
          const b = bm.get(id);
          if (b) b.set('label', label);
        }
      } catch {
        /* block ids vary by plugin version — best effort */
      }

      const emit = () => {
        try {
          onChangeRef.current({ mjml: ed.getHtml() });
        } catch {
          /* transient invalid MJML mid-edit */
        }
      };
      ed.on('update', emit);
      ed.on('component:update', emit);
      ed.on('component:add', emit);
      ed.on('component:remove', emit);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="cf-builder" ref={containerRef} />;
}
