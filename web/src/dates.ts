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

/** „czwartek” */
export function weekdayLong(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", { weekday: "long", timeZone: "UTC" }).format(utcNoon(iso));
}

/** „2026-11-05” → „5.11” */
export function dayMonth(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}.${String(m).padStart(2, "0")}`;
}

/** Numer tygodnia ISO (poniedziałek–niedziela). */
export function isoWeek(iso: string): number {
  // Tydzień należy do roku swojego czwartku; tydzień 1 zawiera 4 stycznia.
  const thursday = utcNoon(iso);
  thursday.setUTCDate(thursday.getUTCDate() - ((thursday.getUTCDay() + 6) % 7) + 3);
  const jan4 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4, 12));
  const firstThursday = new Date(jan4);
  firstThursday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 864e5));
}

/** Poniedziałek tygodnia, w którym jest dany dzień. */
export function mondayOf(iso: string): string {
  const d = utcNoon(iso);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** „2–8 listopada”, „30 listopada – 6 grudnia” (tydzień od poniedziałku). */
export function weekRangeLabel(monday: string): string {
  const end = utcNoon(monday);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date, withMonth: boolean) =>
    new Intl.DateTimeFormat("pl-PL", withMonth ? { day: "numeric", month: "long", timeZone: "UTC" } : { day: "numeric", timeZone: "UTC" }).format(d);
  const start = utcNoon(monday);
  return start.getUTCMonth() === end.getUTCMonth() ? `${fmt(start, false)}–${fmt(end, true)}` : `${fmt(start, true)} – ${fmt(end, true)}`;
}

/** Czas sprawdzenia: „dziś, 01:33”, „wczoraj, 06:02” albo „2.11, 06:02” (czas polski). */
export function formatCheck(timestamp: string): string {
  const day = warsawDate(timestamp);
  const time = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(timestamp));
  const today = todayIso();
  const yesterday = utcNoon(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (day === today) return `dziś, ${time}`;
  if (day === yesterday.toISOString().slice(0, 10)) return `wczoraj, ${time}`;
  return `${dayMonth(day)}, ${time}`;
}

/** Kolejne dni od from do to włącznie (YYYY-MM-DD). */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = utcNoon(from); d <= utcNoon(to) && days.length < 62; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  return days;
}

/** Znacznik czasu → dzień w czasie polskim, YYYY-MM-DD. */
export function warsawDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
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

/** Dzień przesunięty o podaną liczbę dni (YYYY-MM-DD). */
export function addDays(iso: string, days: number): string {
  const d = utcNoon(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = poniedziałek … 6 = niedziela */
export function weekdayIndex(iso: string): number {
  return (utcNoon(iso).getUTCDay() + 6) % 7;
}

/** „Czwartek, 5 listopada 2026” */
export function formatDayWithYear(iso: string): string {
  return capitalize(
    new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(utcNoon(iso)),
  ).replace(/\s*r\.$/, "");
}
