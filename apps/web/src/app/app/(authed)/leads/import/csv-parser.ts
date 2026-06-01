/**
 * Minimal but RFC-4180-ish CSV parser. Handles:
 *  - Comma or semicolon as separator (auto-detected from the header line).
 *  - Double-quoted fields, with `""` as an escaped quote.
 *  - Optional UTF-8 BOM.
 *  - CRLF and LF line endings.
 *  - Empty trailing rows.
 *
 * Returns { headers, rows } where `rows` is an array of records keyed by the
 * raw header strings (not lowercased — the mapping layer is responsible for
 * normalisation).
 */

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  separator: ',' | ';';
}

export function parseCsv(text: string): ParsedCsv {
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  // Auto-detect separator from the first non-empty line.
  const firstLineEnd = text.search(/\r?\n/);
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const commaCount = countSeparator(firstLine, ',');
  const semiCount = countSeparator(firstLine, ';');
  const separator: ',' | ';' = semiCount > commaCount ? ';' : ',';

  const all = parseRows(text, separator);
  if (all.length === 0) {
    return { headers: [], rows: [], separator };
  }
  const headers = (all[0] ?? []).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < all.length; i += 1) {
    const cells = all[i]!;
    if (cells.every((c) => c.trim() === '')) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return { headers, rows, separator };
}

function countSeparator(line: string, sep: ',' | ';'): number {
  // Naïve count but ignores commas inside double-quoted strings.
  let count = 0;
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuote = !inQuote;
    } else if (ch === sep && !inQuote) {
      count += 1;
    }
  }
  return count;
}

function parseRows(text: string, sep: ',' | ';'): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuote = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuote = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === sep) {
        cur.push(field);
        field = '';
      } else if (ch === '\n') {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = '';
      } else if (ch === '\r') {
        // skip — \n handles the line break
      } else {
        field += ch;
      }
    }
  }
  // last field / row
  if (field !== '' || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}
