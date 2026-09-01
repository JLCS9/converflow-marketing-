'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

function esc(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  );
}

// StarterKit v3 bundles Link — we disable its copy and use an extended Link that
// keeps an inline `style` attribute, so "buttons" (styled <a>) survive round-trips.
const StyledLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('style'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.style ? { style: attrs.style as string } : {},
      },
    };
  },
}).configure({ openOnClick: false, autolink: true });

// Los VALORES ({nombre}, {email}…) son variables de plantilla: no se traducen.
// Las etiquetas se traducen en render (constante de módulo: sin hooks aquí).
const VARIABLES = [
  { value: '{nombre}', labelKey: 'varFullName' },
  { value: '{first_name}', labelKey: 'varFirstName' },
  { value: '{email}', labelKey: 'varEmail' },
  { value: '{telefono}', labelKey: 'varPhone' },
];

const BUTTON_STYLE =
  'display:inline-block;background-color:#2563eb;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600';

export function RichEmailEditor({
  initialHtml,
  onChange,
}: {
  initialHtml?: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false, heading: { levels: [1, 2, 3] } }),
      StyledLink,
    ],
    content: initialHtml ?? '',
    immediatelyRender: false, // required for Next SSR
    editorProps: {
      attributes: {
        class:
          'min-h-[160px] max-h-[420px] overflow-y-auto px-3 py-2 text-sm focus:outline-none ' +
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
          '[&_a]:text-primary-700 [&_a]:underline [&_h1]:text-lg [&_h1]:font-semibold ' +
          '[&_h2]:text-base [&_h2]:font-semibold [&_blockquote]:border-l-2 ' +
          '[&_blockquote]:border-ink-200 [&_blockquote]:pl-3 [&_blockquote]:text-ink-600 ' +
          // make styled-link "buttons" show their styling inside the editor too
          '[&_a[style]]:no-underline',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  return (
    <div className="rounded-md border border-ink-300 focus-within:border-ink-700">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const t = useTranslations('uiBits');
  const btn = (active: boolean) =>
    `rounded px-2 py-1 text-sm ${active ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100'}`;

  function addLink() {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt(t('linkUrlPrompt'), prev ?? 'https://');
    if (url === null) return;
    if (url === '') editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  function addButton() {
    const text = window.prompt(t('buttonTextPrompt'), t('buttonTextDefault'));
    if (!text) return;
    const url = window.prompt(t('buttonUrlPrompt'), 'https://');
    if (!url) return;
    editor
      .chain()
      .focus()
      .insertContent(`<a href="${esc(url)}" style="${BUTTON_STYLE}">${esc(text)}</a>&nbsp;`)
      .run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-ink-100 px-1.5 py-1">
      <button type="button" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title={t('bold')}>
        <strong>B</strong>
      </button>
      <button type="button" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title={t('italic')}>
        <em>i</em>
      </button>
      <button type="button" className={btn(editor.isActive('strike'))} onClick={() => editor.chain().focus().toggleStrike().run()} title={t('strike')}>
        <s>S</s>
      </button>
      <span className="mx-1 h-4 w-px bg-ink-200" />
      <button type="button" className={btn(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title={t('heading')}>
        H
      </button>
      <button type="button" className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} title={t('bulletList')}>
        • {t('bulletList')}
      </button>
      <button type="button" className={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title={t('orderedList')}>
        1. {t('bulletList')}
      </button>
      <button type="button" className={btn(editor.isActive('blockquote'))} onClick={() => editor.chain().focus().toggleBlockquote().run()} title={t('blockquote')}>
        ❝
      </button>
      <span className="mx-1 h-4 w-px bg-ink-200" />
      <button type="button" className={btn(editor.isActive('link'))} onClick={addLink} title={t('link')}>
        🔗
      </button>
      <button type="button" className={btn(false)} onClick={addButton} title={t('insertButton')}>
        🔲 {t('buttonLabel')}
      </button>
      <span className="mx-1 h-4 w-px bg-ink-200" />
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) editor.chain().focus().insertContent(e.target.value).run();
          e.currentTarget.value = '';
        }}
        className="rounded border border-ink-200 px-1.5 py-1 text-xs text-ink-700"
        title={t('insertVariable')}
      >
        <option value="">{t('addVariable')}</option>
        {VARIABLES.map((v) => (
          <option key={v.value} value={v.value}>
            {t(v.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
}
