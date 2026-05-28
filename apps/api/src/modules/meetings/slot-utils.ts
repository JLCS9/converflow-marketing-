/**
 * Timezone-aware free-slot generation for meeting proposals.
 *
 * We avoid a date library: tz offsets are derived from `Intl.DateTimeFormat`,
 * and calendar-date arithmetic uses `Date.UTC` (DST-safe because business hours
 * never straddle the 2–3am DST transition).
 */

export interface BusyInterval {
  start: string;
  end: string;
}

export interface Slot {
  startIso: string;
  endIso: string;
}

// Offset (ms) of `tz` relative to UTC at the given instant.
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const asUTC = Date.UTC(
    +map.year!,
    +map.month! - 1,
    +map.day!,
    +map.hour!,
    +map.minute!,
    +map.second!,
  );
  return asUTC - date.getTime();
}

// UTC Date for a wall-clock time in `tz`.
function zonedWallTimeToUtc(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  const offset = tzOffsetMs(new Date(guess), tz);
  return new Date(guess - offset);
}

// Calendar y/m/d of an instant as seen in `tz`.
function ymdInTz(date: Date, tz: string): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  return { y: +map.year!, m: +map.month!, d: +map.day! };
}

function overlapsBusy(startMs: number, endMs: number, busy: BusyInterval[]): boolean {
  for (const b of busy) {
    const bs = new Date(b.start).getTime();
    const be = new Date(b.end).getTime();
    if (startMs < be && endMs > bs) return true;
  }
  return false;
}

export function generateFreeSlots(opts: {
  now: Date;
  tz: string;
  durationMin: number;
  busy: BusyInterval[];
  days?: number;
  workStartHour?: number;
  workEndHour?: number;
  stepMin?: number;
  maxSlots?: number;
}): Slot[] {
  const { now, tz, durationMin, busy } = opts;
  const days = opts.days ?? 10;
  const workStart = opts.workStartHour ?? 9;
  const workEnd = opts.workEndHour ?? 18;
  const step = opts.stepMin ?? 30;
  const maxSlots = opts.maxSlots ?? 12;
  const nowMs = now.getTime();

  const startDate = ymdInTz(now, tz);
  const slots: Slot[] = [];

  for (let i = 0; i < days && slots.length < maxSlots; i++) {
    const cal = new Date(Date.UTC(startDate.y, startDate.m - 1, startDate.d + i));
    const y = cal.getUTCFullYear();
    const m = cal.getUTCMonth() + 1;
    const d = cal.getUTCDate();
    const weekday = cal.getUTCDay(); // 0=Sun .. 6=Sat
    if (weekday === 0 || weekday === 6) continue;

    for (
      let mins = workStart * 60;
      mins + durationMin <= workEnd * 60 && slots.length < maxSlots;
      mins += step
    ) {
      const slotStart = zonedWallTimeToUtc(y, m, d, Math.floor(mins / 60), mins % 60, tz);
      const startMs = slotStart.getTime();
      const endMs = startMs + durationMin * 60_000;
      if (startMs <= nowMs) continue;
      if (overlapsBusy(startMs, endMs, busy)) continue;
      slots.push({ startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() });
    }
  }

  return slots;
}
