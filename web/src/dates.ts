// Daty w danych to dni kalendarzowe (YYYY-MM-DD) bez strefy czasowej.
// "Dziś" liczymy zawsze w strefie Europe/Warsaw, niezależnie od ustawień telefonu.

const TZ = "Europe/Warsaw";

export interface Month {
  year: number;
  month: number; // 1–12
}

export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function currentMonth(): Month {
  const [y, m] = todayIso().split("-").map(Number);
  return { year: y!, month: m! };
}

export function monthKey(m: Month): string {
  return `${m.year}-${String(m.month).padStart(2, "0")}`;
}

export function parseMonthKey(key: string | null): Month | null {
  const m = key?.match(/^(\d{4})-(\d{2})$/);
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
}

export function addMonths(m: Month, delta: number): Month {
  const index = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function utcNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("pl") + text.slice(1);
}

/** „Październik 2026” */
export function formatMonth(m: Month): string {
  const text = new Intl.DateTimeFormat("pl-PL", { month: "long", timeZone: "UTC" }).format(utcNoon(`${monthKey(m)}-01`));
  return `${capitalize(text)} ${m.year}`;
}

/** „Poniedziałek, 5 października” */
export function formatDay(iso: string): string {
  return capitalize(new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(utcNoon(iso)));
}

/** „pon. 5.10” */
export function formatShortDay(iso: string): string {
  const weekday = new Intl.DateTimeFormat("pl-PL", { weekday: "short", timeZone: "UTC" }).format(utcNoon(iso));
  const [, m, d] = iso.split("-").map(Number);
  return `${weekday} ${d}.${String(m).padStart(2, "0")}`;
}

/** „07:30” → „7:30” */
export function formatTime(time: string | null): string {
  return time ? time.replace(/^0(\d)/, "$1") : "?";
}

export function formatTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return "godzina nieznana";
  return end ? `${formatTime(start)}–${formatTime(end)}` : formatTime(start);
}

/** „29 października 2026, 8:16” (czas polski) */
export function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "long", timeStyle: "short", timeZone: TZ }).format(new Date(iso));
}

/** Dni miesiąca w siatce kalendarza od poniedziałku; null = pusta komórka. */
export function calendarGrid(m: Month): (string | null)[] {
  const first = utcNoon(`${monthKey(m)}-01`);
  const offset = (first.getUTCDay() + 6) % 7; // poniedziałek = 0
  const days = new Date(Date.UTC(m.year, m.month, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${monthKey(m)}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export const WEEKDAYS_SHORT = ["pon", "wt", "śr", "czw", "pt", "sob", "nd"];
