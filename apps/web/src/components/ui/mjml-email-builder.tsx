'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import 'grapesjs/dist/css/grapes.min.css';
import './grapesjs-theme.css';

// El texto del cuerpo se traduce en render (constante de módulo: sin hooks aquí).
const defaultMjml = (placeholder: string) =>
  '<mjml><mj-body background-color="#f4f4f5">' +
  '<mj-section background-color="#ffffff" padding="24px">' +
  '<mj-column>' +
  `<mj-text font-size="16px" color="#1a1a1a" line-height="1.5">${placeholder}</mj-text>` +
  '</mj-column></mj-section></mj-body></mjml>';

// Translated labels for the MJML preset blocks (default labels are terse).
// Constante de módulo: guarda claves de diccionario y se traduce en render.
const BLOCK_LABEL_KEYS: Record<string, string> = {
  'mj-1-column': 'blockOneColumn',
  'mj-2-columns': 'blockTwoColumns',
  'mj-3-columns': 'blockThreeColumns',
  'mj-text': 'blockText',
  'mj-image': 'blockImage',
  'mj-button': 'blockButton',
  'mj-divider': 'blockDivider',
  'mj-spacer': 'blockSpacer',
  'mj-social-group': 'blockSocialGroup',
  'mj-social-element': 'blockSocialElement',
  'mj-navbar': 'blockNavbar',
  'mj-hero': 'blockHero',
  'mj-wrapper': 'blockWrapper',
  'mj-section': 'blockSection',
  'mj-column': 'blockColumn',
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
  const t = useTranslations('uiBits');
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
            { id: 'desktop', name: t('deviceDesktop'), width: '' },
            { id: 'mobile', name: t('deviceMobile'), width: '375px', widthMedia: '480px' },
          ],
        },
        components: initialRef.current || defaultMjml(t('emailPlaceholder')),
      });
      editor = ed;

      // Relabel the blocks in the user's language for a clearer panel.
      try {
        const bm = ed.BlockManager;
        for (const [id, labelKey] of Object.entries(BLOCK_LABEL_KEYS)) {
          const b = bm.get(id);
          if (b) b.set('label', t(labelKey));
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
