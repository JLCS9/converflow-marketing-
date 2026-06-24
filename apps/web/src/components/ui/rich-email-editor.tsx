'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

/**
 * WYSIWYG email editor (Tiptap). Emits sanitized-on-the-server HTML via onChange.
 * Uncontrolled: pass `initialHtml` once on mount; to reset/prefill, change the
 * component `key` in the parent so it remounts.
 */
export function RichEmailEditor({
  initialHtml,
  onChange,
}: {
  initialHtml?: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: initialHtml ?? '',
    immediatelyRender: false, // required for Next SSR (avoids hydration mismatch)
    editorProps: {
      attributes: {
        class:
          'min-h-[140px] max-h-[360px] overflow-y-auto px-3 py-2 text-sm focus:outline-none ' +
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
          '[&_a]:text-primary-700 [&_a]:underline [&_h1]:text-lg [&_h1]:font-semibold ' +
          '[&_h2]:text-base [&_h2]:font-semibold [&_blockquote]:border-l-2 ' +
          '[&_blockquote]:border-ink-200 [&_blockquote]:pl-3 [&_blockquote]:text-ink-600',
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
  const btn = (active: boolean) =>
    `rounded px-2 py-1 text-sm ${active ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100'}`;

  function addLink() {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL del enlace:', prev ?? 'https://');
    if (url === null) return;
    if (url === '') editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-ink-100 px-1.5 py-1">
      <button type="button" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrita">
        <strong>B</strong>
      </button>
      <button type="button" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Cursiva">
        <em>i</em>
      </button>
      <button type="button" className={btn(editor.isActive('strike'))} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado">
        <s>S</s>
      </button>
      <span className="mx-1 h-4 w-px bg-ink-200" />
      <button type="button" className={btn(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Encabezado">
        H
      </button>
      <button type="button" className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista">
        • Lista
      </button>
      <button type="button" className={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada">
        1. Lista
      </button>
      <button type="button" className={btn(editor.isActive('blockquote'))} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Cita">
        ❝
      </button>
      <span className="mx-1 h-4 w-px bg-ink-200" />
      <button type="button" className={btn(editor.isActive('link'))} onClick={addLink} title="Enlace">
        🔗
      </button>
    </div>
  );
}
