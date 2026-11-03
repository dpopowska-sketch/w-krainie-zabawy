// „Dodaj do kalendarza”: link do Kalendarza Google i plik .ics (Apple, Outlook i inne).
// Godziny w danych to czas polski – do pliku .ics trafiają w UTC, więc zgadzają się
// niezależnie od strefy ustawionej w telefonie.
import type { PublishedActivity } from "../../src/published.js";

const TZ = "Europe/Warsaw";
const PLACE = "Słoneczne Przedszkole w Żernicy";
const DEFAULT_MINUTES = 60;

export interface CalendarEvent {
  uid: string;
  title: string;
  description: string;
  location: string;
  /** Czas polski, YYYY-MM-DD i HH:MM. */
  date: string;
  start: string;
  end: string;
}

/** Przesunięcie czasu polskiego względem UTC (w minutach) w danej chwili. */
function warsawOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return (Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - at.getTime()) / 60000;
}

/** „2026-10-20”, „12:45” (czas polski) → chwila w UTC. Uwzględnia zmianę czasu. */
export function warsawToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const asIfUtc = Date.UTC(y!, m! - 1, d!, h!, min!);
  return new Date(asIfUtc - warsawOffsetMinutes(new Date(asIfUtc)) * 60000);
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h! * 60 + m! + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** „Słowiki - zajęcia oparte na nauce śpiewu…” → „Słowiki” (pełna nazwa trafia do opisu). */
export function shortTitle(activity: string): string {
  return activity.split(/\s+[-–]\s+/)[0]!.trim();
}

/** null, gdy terminu nie da się wpisać do kalendarza (brak godziny). */
export function calendarEvent(a: PublishedActivity, groupName: string, pageUrl: string): CalendarEvent | null {
  if (!a.start) return null;
  const description = [
    a.activity,
    a.teacher && `Prowadzi: ${a.teacher}`,
    a.subgroup && `Podgrupa: ${a.subgroup}`,
    `Grupa: ${groupName}`,
    a.verification === "needs_review" && "Termin niepotwierdzony – sprawdź przed zajęciami.",
    `Aktualny harmonogram: ${pageUrl}`,
  ].filter(Boolean);
  return {
    uid: `${a.id}@w-krainie-zabawy`,
    title: `${shortTitle(a.activity)} (${groupName})`,
    description: description.join("\n"),
    location: a.location ? `${PLACE}, ${a.location}` : PLACE,
    date: a.date,
    start: a.start,
    end: a.end ?? addMinutes(a.start, DEFAULT_MINUTES),
  };
}

/** „2026-10-20”, „12:45” → „20261020T124500” */
function compactLocal(date: string, time: string): string {
  return `${date.replaceAll("-", "")}T${time.replace(":", "")}00`;
}

/** Chwila → „20261020T104500Z” */
function compactUtc(at: Date): string {
  return at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${compactLocal(e.date, e.start)}/${compactLocal(e.date, e.end)}`,
    ctz: TZ,
    details: e.description,
    location: e.location,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Długie linie łamiemy (wymóg formatu: do 75 bajtów; 60 znaków to zapas na polskie litery). */
function fold(line: string): string {
  const chunks: string[] = [];
  for (let i = 0; i < line.length; i += 60) chunks.push(line.slice(i, i + 60));
  return chunks.join("\r\n ");
}

export function icsText(e: CalendarEvent, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//W krainie zabawy//Harmonogram//PL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${compactUtc(now)}`,
    `DTSTART:${compactUtc(warsawToUtc(e.date, e.start))}`,
    `DTEND:${compactUtc(warsawToUtc(e.date, e.end))}`,
    `SUMMARY:${escapeIcs(e.title)}`,
    `DESCRIPTION:${escapeIcs(e.description)}`,
    `LOCATION:${escapeIcs(e.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Data URL zamiast Bloba – Safari na iPhonie pewniej otwiera go jako wydarzenie. */
export function icsDataUrl(e: CalendarEvent): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(icsText(e))}`;
}

/** Nazwa pobieranego pliku, np. „slowiki-2026-11-05.ics”. */
export function icsFileName(e: CalendarEvent): string {
  const slug = shortTitle(e.title)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${slug || "zajecia"}-${e.date}.ics`;
}
