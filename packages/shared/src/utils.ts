/**
 * Cross-platform date parser that accepts the formats Spanish-speaking users
 * actually drop into CSV cells:
 *
 *   - DD/MM/YYYY · DD-MM-YYYY · DD.MM.YYYY (and DD/MM/YY)
 *   - ISO 8601: YYYY-MM-DD and full datetime variants
 *   - Anything else that the JS Date constructor can already understand
 *     (e.g. "Nov 24, 2025"), as a last-resort fallback.
 *
 * Returns null if nothing matches so the caller can produce a useful error
 * instead of silently storing `Invalid Date`.
 */
export function parseFlexibleDate(raw: unknown): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  // ISO 8601 family — try first so "2025-11-24" is unambiguous.
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // European DD[/.-]MM[/.-]YYYY (and YY).
  const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yyyy = Number(m[3]);
    if (yyyy < 100) yyyy += yyyy >= 70 ? 1900 : 2000; // 99→1999, 25→2025
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    const d = new Date(yyyy, mm - 1, dd);
    // Reject 31/02 style overflow.
    if (
      d.getFullYear() === yyyy &&
      d.getMonth() === mm - 1 &&
      d.getDate() === dd
    ) {
      return d;
    }
    return null;
  }

  // Last resort: let the JS Date constructor have a go.
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}
