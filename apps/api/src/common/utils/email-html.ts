import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize rich email HTML (from our composer or, later, inbound mail). Strips
 * scripts, event handlers and anything that could execute; keeps common
 * formatting + links + images. Used before storing/sending/rendering.
 */
export function sanitizeEmailHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      'p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'a',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr',
      'h1', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      '*': ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    // Force links to open safely.
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
    // Only a conservative subset of inline styles.
    allowedStyles: {
      '*': {
        'color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^[a-z-]+$/i],
        'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
        'font-weight': [/^bold$/, /^\d+$/],
        'text-decoration': [/^underline$/, /^line-through$/, /^none$/],
      },
    },
  });
}

/** Plain-text version of HTML — for previews, AI context and non-HTML clients. */
export function htmlToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
