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
    // Conservative inline styles — incl. what email "buttons" need (background,
    // padding, radius, display). No url()/expression() (color regexes block them).
    allowedStyles: {
      '*': {
        'color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^[a-z-]+$/i],
        'background-color': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^[a-z-]+$/i],
        'background': [/^#(0x)?[0-9a-f]+$/i, /^rgb\(/, /^[a-z-]+$/i],
        'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
        'font-weight': [/^bold$/, /^normal$/, /^\d+$/],
        'font-size': [/^[\d.]+(px|em|rem|%)$/],
        'text-decoration': [/^underline$/, /^line-through$/, /^none$/],
        'display': [/^inline-block$/, /^block$/, /^inline$/],
        'padding': [/^[\d.]+(px|em|rem|%)?( [\d.]+(px|em|rem|%)?){0,3}$/],
        'margin': [/^[\d.]+(px|em|rem|%)?( [\d.]+(px|em|rem|%)?){0,3}$/],
        'border-radius': [/^[\d.]+(px|em|rem|%)?$/],
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
