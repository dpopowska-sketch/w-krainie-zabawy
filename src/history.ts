// Historia zmian harmonogramu dla wybranych grup (config: historyGroups).
//
// history/<grupa>/state.json   – ostatni zapamiętany stan wszystkich terminów grupy,
// history/<grupa>/events.json  – dziennik zmian (dopisywany, nic nie jest usuwane),
// history/<grupa>/RRRR-MM.md   – czytelne podsumowanie miesiąca: harmonogram + historia zmian.
//
// Przy każdej synchronizacji porównujemy aktualne terminy z zapamiętanym stanem.
// Pliki zmieniają się tylko wtedy, gdy zmieniło się coś w danych.
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadGroups, readJsonIfExists, writeJson } from "./config.js";
import type { PublishedActivity, Status } from "./published.js";

const HISTORY_DIR = path.join(ROOT, "history");

/** Pola terminu, których zmiany śledzimy. */
interface Snapshot {
  activity: string;
  teacher: string | null;
  date: string;
  start: string | null;
  end: string | null;
  status: Status;
  verification: "verified" | "needs_review";
}

export interface HistoryEvent {
  /** Kiedy zmiana została zauważona (dla nowych terminów: kiedy źródło pojawiło się na stronie). */
  at: string;
  id: string;
  kind: "added" | "changed" | "removed";
  /** Miesiąc terminu (pierwotny), do którego zapisujemy zdarzenie. */
  month: string;
  activity: string;
  date: string;
  start: string | null;
  changes?: Record<string, [string | null, string | null]>;
  status?: Status;
  /** Ogłoszenia, na podstawie których termin ma obecny status. */
  announcements?: string[];
}

const FIELD_PL: Record<keyof Snapshot, string> = {
  activity: "zajęcia",
  teacher: "prowadzący",
  date: "data",
  start: "początek",
  end: "koniec",
  status: "status",
  verification: "weryfikacja",
};
const STATUS_PL: Record<Status, string> = { scheduled: "zaplanowane", cancelled: "odwołane", rescheduled: "przeniesione", additional: "dodatkowe" };
const VERIFICATION_PL = { verified: "zweryfikowane", needs_review: "do weryfikacji" };
const MONTHS_PL = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];

function snapshot(a: PublishedActivity): Snapshot {
  return { activity: a.activity, teacher: a.teacher, date: a.date, start: a.start, end: a.end, status: a.status, verification: a.verification };
}

function originalMonth(a: { date: string; previous?: { date: string } | null }): string {
  return (a.previous?.date ?? a.date).slice(0, 7);
}

function announcementTexts(a: PublishedActivity): string[] {
  return a.sources.flatMap((s) => (s.type === "announcement" ? [s.text.replace(/^[–-]\s*/, "")] : []));
}

function display(field: keyof Snapshot, value: string | null): string | null {
  if (value === null) return null;
  if (field === "status") return STATUS_PL[value as Status];
  if (field === "verification") return VERIFICATION_PL[value as Snapshot["verification"]];
  return value;
}

/**
 * Termin widziany po raz pierwszy: odtwarzamy jego historię ze źródeł –
 * najpierw pojawienie się w tabeli, potem zmiany z ogłoszeń (każde ze swoją datą).
 * Dodatkowe zajęcia (tylko z ogłoszenia) mają jedno zdarzenie.
 */
function firstSightEvents(a: PublishedActivity, now: string): HistoryEvent[] {
  const table = a.sources.find((s) => s.type === "schedule");
  const announcements = a.sources.filter((s) => s.type === "announcement");
  const lastAnnouncement = announcements.at(-1);
  const original = a.previous ?? { date: a.date, start: a.start, end: a.end };
  const base = { id: a.id, month: originalMonth(a), activity: a.activity };

  if (!table) {
    return [{ ...base, at: lastAnnouncement?.firstSeen ?? now, kind: "added", date: a.date, start: a.start, status: a.status, announcements: announcementTexts(a) }];
  }
  const events: HistoryEvent[] = [
    { ...base, at: table.firstSeen || now, kind: "added", date: original.date, start: original.start, status: "scheduled" },
  ];
  const changes: NonNullable<HistoryEvent["changes"]> = {};
  if (a.status !== "scheduled") changes[FIELD_PL.status] = [STATUS_PL.scheduled, STATUS_PL[a.status]];
  if (a.previous) {
    if (a.previous.date !== a.date) changes[FIELD_PL.date] = [a.previous.date, a.date];
    if (a.previous.start !== a.start) changes[FIELD_PL.start] = [a.previous.start, a.start];
    if (a.previous.end !== a.end) changes[FIELD_PL.end] = [a.previous.end, a.end];
  }
  if (Object.keys(changes).length) {
    events.push({
      ...base,
      at: lastAnnouncement?.firstSeen ?? now,
      kind: "changed",
      date: original.date,
      start: original.start,
      changes,
      status: a.status,
      announcements: announcementTexts(a),
    });
  }
  return events;
}

/** Porównuje terminy grupy z zapamiętanym stanem i dopisuje zdarzenia. Zwraca nowe zdarzenia. */
function updateGroup(group: string, activities: PublishedActivity[], now: string): HistoryEvent[] {
  const dir = path.join(HISTORY_DIR, group);
  const statePath = path.join(dir, "state.json");
  const eventsPath = path.join(dir, "events.json");
  const state = readJsonIfExists<Record<string, Snapshot & { month: string }>>(statePath) ?? {};
  const events = readJsonIfExists<HistoryEvent[]>(eventsPath) ?? [];
  const fresh: HistoryEvent[] = [];

  const current = new Map(activities.map((a) => [a.id, a]));
  for (const a of activities) {
    const before = state[a.id];
    const after = snapshot(a);
    const base = { id: a.id, month: originalMonth(a), activity: a.activity, date: a.date, start: a.start };
    if (!before) {
      fresh.push(...firstSightEvents(a, now));
      continue;
    }
    const changes: HistoryEvent["changes"] = {};
    for (const field of Object.keys(after) as (keyof Snapshot)[]) {
      if (before[field] !== after[field]) changes[FIELD_PL[field]] = [display(field, before[field]), display(field, after[field])];
    }
    if (Object.keys(changes).length) {
      fresh.push({ ...base, at: now, kind: "changed", changes, status: a.status, announcements: announcementTexts(a) });
    }
  }
  for (const [id, before] of Object.entries(state)) {
    if (!current.has(id)) {
      fresh.push({ id, at: now, kind: "removed", month: before.month, activity: before.activity, date: before.date, start: before.start });
    }
  }

  if (fresh.length === 0 && fs.existsSync(eventsPath)) return [];
  events.push(...fresh.sort((x, y) => x.at.localeCompare(y.at) || x.date.localeCompare(y.date)));
  const nextState = Object.fromEntries(activities.map((a) => [a.id, { ...snapshot(a), month: originalMonth(a) }]));
  writeJson(statePath, nextState);
  writeJson(eventsPath, events);
  writeMonthFiles(group, activities, events);
  return fresh;
}

function formatTime(t: string | null): string {
  return t ? t.replace(/^0(\d)/, "$1") : "?";
}

function formatDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(d)}.${m}`;
}

function formatAt(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(new Date(iso));
}

function describe(e: HistoryEvent): string {
  const what = `${formatDate(e.date)} ${formatTime(e.start)} ${e.activity}`;
  const why = e.announcements?.length ? ` (ogłoszenie: „${e.announcements.at(-1)}”)` : "";
  if (e.kind === "added") {
    return `Nowy termin: ${what}${e.status && e.status !== "scheduled" ? ` – ${STATUS_PL[e.status]}` : ""}${why}`;
  }
  if (e.kind === "removed") return `Termin zniknął z danych: ${what}`;
  const changes = Object.entries(e.changes ?? {})
    .map(([field, [from, to]]) => `${field}: ${from ?? "–"} → ${to ?? "–"}`)
    .join("; ");
  return `Zmiana: ${what} – ${changes}${why}`;
}

/**
 * Wiele terminów dodanych naraz z tabeli (np. nowy harmonogram na miesiąc) to jeden wpis –
 * pełna lista jest w tabeli powyżej. Pojedyncze nowe terminy i wszystkie zmiany są osobno.
 */
function renderEvents(events: HistoryEvent[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < events.length; ) {
    const e = events[i]!;
    const isTableAdd = (x: HistoryEvent) => x.kind === "added" && x.at === e.at && x.status === "scheduled" && !x.announcements?.length;
    let j = i;
    while (j < events.length && isTableAdd(events[j]!)) j++;
    if (j - i > 3) {
      const dates = [...new Set(events.slice(i, j).map((x) => formatDate(x.date)))].join(", ");
      lines.push(`- **${formatAt(e.at)}** – Nowy harmonogram z tabeli: ${j - i} terminów (dni: ${dates})`);
      i = j;
      continue;
    }
    lines.push(`- **${formatAt(e.at)}** – ${describe(e)}`);
    i++;
  }
  return lines;
}

/** Jeden plik na miesiąc: aktualny harmonogram i pełna historia zmian. */
function writeMonthFiles(group: string, activities: PublishedActivity[], events: HistoryEvent[]) {
  const config = loadGroups();
  const name = config.groups.find((g) => g.id === group)?.name ?? group;
  const months = [...new Set([...activities.map(originalMonth), ...events.map((e) => e.month)])].sort();
  for (const month of months) {
    const [y, m] = month.split("-").map(Number);
    const monthName = `${MONTHS_PL[m! - 1]} ${y}`;
    const rows = activities
      .filter((a) => originalMonth(a) === month)
      .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
    const monthEvents = events.filter((e) => e.month === month);
    const lines = [
      `# ${name} – ${monthName}`,
      "",
      "Plik generowany automatycznie przy każdej zmianie danych – nie edytuj go.",
      "",
      "## Harmonogram (stan aktualny)",
      "",
      "| Data | Godzina | Zajęcia | Prowadzący | Status |",
      "|---|---|---|---|---|",
      ...rows.map((a) => {
        const status =
          a.status === "rescheduled" && a.previous
            ? `przeniesione (wcześniej ${formatDate(a.previous.date)} ${formatTime(a.previous.start)})`
            : STATUS_PL[a.status];
        const review = a.verification === "needs_review" ? " ⚠ do weryfikacji" : "";
        return `| ${formatDate(a.date)} | ${formatTime(a.start)}–${formatTime(a.end)} | ${a.activity} | ${a.teacher ?? "?"} | ${status}${review} |`;
      }),
      "",
      "## Historia zmian",
      "",
      ...(monthEvents.length ? renderEvents(monthEvents) : ["Brak zmian."]),
      "",
    ];
    fs.mkdirSync(path.join(HISTORY_DIR, group), { recursive: true });
    fs.writeFileSync(path.join(HISTORY_DIR, group, `${month}.md`), lines.join("\n"), "utf8");
  }
}

/** Aktualizuje historię dla wszystkich grup z historyGroups. */
export function updateHistory(activities: PublishedActivity[], now = new Date().toISOString()): number {
  const config = loadGroups();
  let count = 0;
  for (const group of config.historyGroups) {
    count += updateGroup(group, activities.filter((a) => a.group === group), now).length;
  }
  return count;
}
