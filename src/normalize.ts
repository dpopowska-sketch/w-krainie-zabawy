// Zamiana komórek tabeli na pojedyncze terminy oraz reguły walidacji.
// Wszystko tutaj jest deterministyczne – żadnego AI.
import { findGroup, type GroupsConfig } from "./config.js";

export type IssueCode =
  | "weekday_mismatch"
  | "incomplete"
  | "date_outside_month"
  | "invalid_date"
  | "invalid_time"
  | "unknown_group"
  | "uncertain_read"
  | "time_conflict";

export interface CellEntry {
  activity: string;
  teacher: string | null;
  groupLabel: string;
  weekday: string | null;
  start: string | null;
  end: string | null;
  dates: string[];
  location: string | null;
  subgroup: string | null;
  cellText?: string;
  uncertain?: boolean;
  note?: string | null;
}

export interface Occurrence {
  key: string;
  group: string;
  activity: string;
  teacher: string | null;
  date: string;
  start: string | null;
  end: string | null;
  location: string | null;
  subgroup: string | null;
  issues: IssueCode[];
}

export interface EntryResult {
  group: string | null;
  occurrences: Occurrence[];
  /** Problemy dotyczące całej komórki (np. brak dat – wtedy nie ma terminów). */
  issues: IssueCode[];
}

const WEEKDAYS = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
const MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];

/** "PAŹDZIERNIK 2026" → { year: 2026, month: 10 } */
export function parseMonthLabel(label: string | null): { year: number; month: number } | null {
  if (!label) return null;
  const lower = label.toLocaleLowerCase("pl");
  const month = MONTHS.findIndex((m) => lower.includes(m.slice(0, 5)));
  const year = lower.match(/20\d\d/)?.[0];
  return month >= 0 && year ? { year: Number(year), month: month + 1 } : null;
}

/** "7.30" / "7:30" / "07.30" → "07:30"; null, jeśli to nie godzina. */
export function normalizeTime(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})[.:](\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
}

function isoDate(year: number, month: number, day: number): string | null {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d.toISOString().slice(0, 10) : null;
}

export function weekdayOf(iso: string): string {
  return WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()]!;
}

export function expandEntry(entry: CellEntry, year: number, month: number, config: GroupsConfig): EntryResult {
  const issues: IssueCode[] = [];
  const group = findGroup(config, entry.groupLabel)?.id ?? null;
  if (!group) issues.push("unknown_group");
  if (entry.uncertain) issues.push("uncertain_read");

  const start = normalizeTime(entry.start);
  const end = normalizeTime(entry.end);
  if ((entry.start && !start) || (entry.end && !end) || (start && end && start >= end)) issues.push("invalid_time");
  if (!start || !end || entry.dates.length === 0) issues.push("incomplete");

  const occurrences: Occurrence[] = [];
  for (const raw of entry.dates) {
    const m = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.?$/);
    const date = m ? isoDate(year, Number(m[2]), Number(m[1])) : null;
    if (!m || !date) {
      issues.push("invalid_date");
      continue;
    }
    const occIssues = [...issues];
    if (Number(m[2]) !== month) occIssues.push("date_outside_month");
    if (entry.weekday && weekdayOf(date) !== entry.weekday.trim().toLocaleLowerCase("pl")) occIssues.push("weekday_mismatch");
    occurrences.push({
      key: `${group ?? entry.groupLabel}|${date}|${start ?? "?"}`,
      group: group ?? entry.groupLabel,
      activity: entry.activity,
      teacher: entry.teacher,
      date,
      start,
      end,
      location: entry.location,
      subgroup: entry.subgroup,
      issues: [...new Set(occIssues)],
    });
  }
  return { group, occurrences, issues: [...new Set(issues)] };
}

/**
 * Oznacza terminy, które w tej samej grupie nakładają się w czasie
 * (np. dwa różne zajęcia o tej samej godzinie). Takie przypadki wymagają weryfikacji.
 */
export function markTimeConflicts(occurrences: Occurrence[]): void {
  for (let i = 0; i < occurrences.length; i++) {
    for (let j = i + 1; j < occurrences.length; j++) {
      const a = occurrences[i]!;
      const b = occurrences[j]!;
      if (a.group !== b.group || a.date !== b.date || !a.start || !a.end || !b.start || !b.end) continue;
      if (a.start < b.end && b.start < a.end) {
        if (!a.issues.includes("time_conflict")) a.issues.push("time_conflict");
        if (!b.issues.includes("time_conflict")) b.issues.push("time_conflict");
      }
    }
  }
}

/** Porównanie tekstów odporne na wielkość liter, polskie znaki i interpunkcję. */
export function fold(text: string | null): string {
  return (text ?? "")
    .toLocaleLowerCase("pl")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sameActivity(a: string, b: string): boolean {
  const fa = fold(a);
  const fb = fold(b);
  return fa === fb || fa.startsWith(fb.slice(0, 25)) || fb.startsWith(fa.slice(0, 25));
}

export function sameTeacher(a: string | null, b: string | null): boolean {
  const surname = (t: string | null) => fold(t).split(" ").filter((w) => w.length > 1).join(" ");
  return surname(a) === surname(b);
}
