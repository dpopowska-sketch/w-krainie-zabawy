// Scala harmonogram, zmiany z ogłoszeń i ręczne decyzje w jeden plik dla strony:
//   data/published/schedule.json  – to, co widzą rodzice,
//   review/pending.md             – lista pozycji do weryfikacji dla właścicielki.
// Bez AI i bez sieci. Wynik zależy tylko od plików w data/ i review/decisions.yaml.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { DATA_DIR, ROOT, SOURCE_PAGE_URL, isMain, loadGroups, readJson, writeJson } from "./config.js";
import { resolveAll, type ChangeEntry } from "./announcements.js";
import { updateHistory } from "./history.js";
import type { SourceDocument } from "./discover.js";
import { loadEvents } from "./events.js";
import { fold, sameActivity, type IssueCode } from "./normalize.js";
import { activityGroups, resolveGroupRef } from "./resolve.js";
import { allDocuments, loadConsensus, sameOccurrence, type ScheduledOccurrence } from "./schedule.js";
import type { Notice, PublishedActivity, PublishedSchedule, SchoolEvent, Source, Status } from "./published.js";
import type { AnnouncementRecord } from "./schema.js";

export type { Notice, PublishedActivity, PublishedSchedule, SchoolEvent, Source, Status };

export const PUBLISHED_PATH = path.join(DATA_DIR, "published", "schedule.json");
const DECISIONS_PATH = path.join(ROOT, "review", "decisions.yaml");
const PENDING_PATH = path.join(ROOT, "review", "pending.md");
const ANNOUNCEMENTS_DIR = path.join(DATA_DIR, "announcements");

export type Decision =
  | { id: string; action: "confirm"; note?: string }
  | { id: string; action: "hide"; note?: string }
  | { id: string; action: "edit"; set: Partial<Pick<PublishedActivity, "date" | "start" | "end" | "teacher" | "activity" | "status">>; note?: string }
  | { notice: string; action: "dismiss"; note?: string }
  | { event: string; action: "confirm" | "hide"; note?: string }
  | { event: string; action: "edit"; set: Partial<Pick<SchoolEvent, "date" | "endDate" | "start" | "end" | "title" | "details">>; note?: string };

const REVIEW_ISSUES: Partial<Record<IssueCode, string>> = {
  weekday_mismatch: "Dzień tygodnia w tabeli nie pasuje do daty",
  uncertain_read: "Fragment tabeli był nieczytelny lub niejednoznaczny",
  invalid_time: "Nieprawidłowa godzina w tabeli",
  date_outside_month: "Data spoza miesiąca harmonogramu",
  month_inferred: "Miesiąc ustalony z daty wgrania pliku, nie z nagłówka",
  runs_disagree: "Dwa niezależne odczyty tabeli się różnią",
  unknown_group: "Nieznana grupa w tabeli",
};
const WARNING_ISSUES: Partial<Record<IssueCode, string>> = {
  time_conflict: "W tym samym czasie grupa ma też inne zajęcia (np. dla podgrupy)",
};

function shortHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/**
 * Stały identyfikator terminu: grupa + pierwotna data i godzina + pierwsze słowa nazwy zajęć.
 * Nie zmienia się po odwołaniu czy przeniesieniu, więc decyzje i historia się go trzymają.
 */
export function activityId(group: string, date: string, start: string | null, activity: string): string {
  const slug = fold(activity).split(" ").filter((t) => t !== "zajecia" && t.length > 1).slice(0, 3).join("-");
  return shortHash(`${group}|${date}|${start ?? ""}|${slug}`);
}

function fromSchedule(o: ScheduledOccurrence, extraIssues: IssueCode[] = []): PublishedActivity {
  const issues = [...new Set([...o.issues, ...extraIssues])];
  const reviewReasons = issues.flatMap((i) => (REVIEW_ISSUES[i] ? [REVIEW_ISSUES[i]!] : []));
  return {
    id: activityId(o.group, o.date, o.start, o.activity),
    group: o.group,
    activity: o.activity,
    teacher: o.teacher,
    date: o.date,
    start: o.start,
    end: o.end,
    location: o.location,
    subgroup: o.subgroup,
    status: "scheduled",
    previous: null,
    verification: reviewReasons.length ? "needs_review" : "verified",
    reviewReasons,
    warnings: issues.flatMap((i) => (WARNING_ISSUES[i] ? [WARNING_ISSUES[i]!] : [])),
    sources: [{ type: "schedule", url: o.sourceUrl, cellText: o.cellText, firstSeen: o.sourceFirstSeen }],
    updatedAt: o.sourceFirstSeen,
  };
}

/**
 * Podmieniona tabela: plik zniknął ze strony, a w tym samym miesiącu jest nowszy plik.
 * Terminy ze starej wersji, których nowa nie zawiera, nie mogą zostać po cichu – pokazujemy zmianę:
 * - ten sam dzień, inna godzina albo jeden termin zamiast jednego → przeniesione (z „Wcześniej: …”),
 * - w innym wypadku stary termin → odwołany, nowe → „Nowy termin”,
 * - nowa wersja w ogóle nie ma tych zajęć dla grupy → do weryfikacji (może nie podmieniono tej strony tabeli).
 * Pliki usunięte po zakończeniu miesiąca (bez nowszej wersji) zostają historią bez zmian.
 */
export function applyTableReplacements(activities: Map<string, PublishedActivity>, occurrences: ScheduledOccurrence[], docs: SourceDocument[]) {
  const docOf = new Map(docs.map((d) => [d.sha256, d]));
  const seen = (o: ScheduledOccurrence) => docOf.get(o.sourceSha256)?.firstSeen ?? "";
  const isCurrent = (o: ScheduledOccurrence) => !docOf.get(o.sourceSha256)?.removedAt;
  const month = (o: ScheduledOccurrence) => o.date.slice(0, 7);
  const sameRow = (a: ScheduledOccurrence, b: ScheduledOccurrence) => a.group === b.group && sameActivity(a.activity, b.activity);
  const idOf = (o: ScheduledOccurrence) => activityId(o.group, o.date, o.start, o.activity);

  const current = occurrences.filter(isCurrent);
  // Terminy z usuniętych plików, dla których jest nowszy, aktualny plik z tym samym miesiącem.
  const stale = occurrences.filter((o) => !isCurrent(o) && current.some((c) => month(c) === month(o) && seen(c) > seen(o)));

  const handled = new Set<ScheduledOccurrence>();
  for (const s of stale) {
    if (handled.has(s)) continue;
    // Wszystkie zmiany tych samych zajęć grupy w tym miesiącu rozpatrujemy razem.
    const oldRow = stale.filter((o) => month(o) === month(s) && sameRow(o, s));
    oldRow.forEach((o) => handled.add(o));
    const newRow = current.filter((c) => month(c) === month(s) && sameRow(c, s));
    const removed = oldRow.filter((o) => !newRow.some((c) => sameOccurrence(c, o)));
    // Nowe są tylko terminy z plików wgranych później niż stara wersja (niezmienione strony tabeli się nie liczą).
    const added = newRow.filter((c) => seen(c) > seen(s) && !oldRow.some((o) => sameOccurrence(c, o)));
    const at = docOf.get(s.sourceSha256)!.removedAt!;

    if (newRow.length === 0) {
      for (const o of removed) {
        const a = activities.get(idOf(o));
        if (!a) continue;
        a.verification = "needs_review";
        a.reviewReasons.push("Plik tabeli z tym terminem usunięto ze strony, a nowa wersja nie zawiera tych zajęć dla grupy");
      }
      continue;
    }

    const pairs: [ScheduledOccurrence, ScheduledOccurrence][] = [];
    const unpairedOld = [...removed];
    const unpairedNew = [...added];
    // Ten sam dzień, inna godzina.
    for (const o of [...unpairedOld]) {
      const c = unpairedNew.find((n) => n.date === o.date);
      if (!c) continue;
      pairs.push([o, c]);
      unpairedOld.splice(unpairedOld.indexOf(o), 1);
      unpairedNew.splice(unpairedNew.indexOf(c), 1);
    }
    // Jeden termin zamiast jednego – przeniesienie na inny dzień.
    if (unpairedOld.length === 1 && unpairedNew.length === 1) {
      pairs.push([unpairedOld[0]!, unpairedNew[0]!]);
      unpairedOld.length = 0;
      unpairedNew.length = 0;
    }

    for (const [o, c] of pairs) {
      const before = activities.get(idOf(o));
      const after = activities.get(idOf(c));
      if (!before || !after) continue;
      after.previous = { date: o.date, start: o.start, end: o.end };
      after.status = "rescheduled";
      after.scheduleChange = { kind: "moved", at };
      after.sources.unshift(...before.sources);
      activities.delete(before.id);
    }
    for (const o of unpairedOld) {
      const a = activities.get(idOf(o));
      if (!a) continue;
      a.status = "cancelled";
      a.scheduleChange = { kind: "removed", at };
      if (at > a.updatedAt) a.updatedAt = at;
    }
    for (const c of unpairedNew) {
      const a = activities.get(idOf(c));
      if (a) a.scheduleChange = { kind: "added", at };
    }
  }
}

function applyAnnouncements(activities: Map<string, PublishedActivity>, entries: ChangeEntry[], notices: Notice[], schedule: ScheduledOccurrence[]) {
  const config = loadGroups();
  for (const entry of entries) {
    if (!entry.isScheduleChange) continue;
    const source: Source = { type: "announcement", text: entry.text, firstSeen: entry.firstSeen, removedAt: entry.removedAt };
    const touch = (a: PublishedActivity) => {
      a.sources.push(source);
      if (entry.firstSeen > a.updatedAt) a.updatedAt = entry.firstSeen;
      // Ogłoszenie zniknęło ze strony przed terminem zajęć – nie wiemy, czy zmiana nadal obowiązuje.
      if (entry.removedAt && a.date >= entry.removedAt.slice(0, 10)) {
        a.verification = "needs_review";
        a.reviewReasons.push("Ogłoszenie o zmianie zostało usunięte ze strony przed terminem zajęć");
      }
    };

    const reviewReasons: string[] = [];
    const infoReasons: string[] = [];
    const noticeGroups = new Set<string>();
    const noticeDates = new Set<string>();
    for (const { change, resolution } of entry.changes) {
      if (resolution.status !== "applied") {
        (resolution.status === "info" ? infoReasons : reviewReasons).push(resolution.reason);
        // Grupy podane wprost, a gdy ich brak – grupy, które mają wskazane zajęcia (inaczej komunikat trafia do wszystkich).
        const groups = change.group_refs.length
          ? change.group_refs.flatMap((ref) => resolveGroupRef(ref, config) ?? [])
          : (activityGroups(change.activity_ref, schedule, config) ?? []);
        for (const g of groups) noticeGroups.add(g);
        for (const d of [...change.dates, ...(change.new_date ? [change.new_date] : [])]) noticeDates.add(d);
        continue;
      }
      for (const effect of resolution.effects) {
        if (effect.kind === "add") {
          const id = activityId(effect.group, effect.date, effect.start, effect.activity);
          const existing = activities.get(id);
          if (existing) {
            touch(existing);
            continue;
          }
          const added: PublishedActivity = {
            id,
            group: effect.group,
            activity: effect.activity,
            teacher: effect.teacher,
            date: effect.date,
            start: effect.start,
            end: effect.end,
            location: null,
            subgroup: null,
            status: "additional",
            previous: null,
            verification: "verified",
            reviewReasons: [],
            warnings: [],
            sources: [],
            updatedAt: entry.firstSeen,
          };
          activities.set(id, added);
          touch(added);
          continue;
        }
        const target = activities.get(activityId(effect.target.group, effect.target.date, effect.target.start, effect.target.activity));
        if (!target) continue; // termin spoza uzgodnionego harmonogramu – nie zgadujemy
        if (effect.kind === "cancel") {
          target.status = "cancelled";
        } else {
          target.previous ??= { date: target.date, start: target.start, end: target.end };
          target.status = "rescheduled";
          if (effect.kind === "reschedule") target.date = effect.date;
          target.start = effect.start;
          target.end = effect.end;
        }
        touch(target);
      }
    }
    if (reviewReasons.length || infoReasons.length) {
      notices.push({
        id: entry.textSha256.slice(0, 12),
        kind: reviewReasons.length ? "review" : "info",
        text: entry.text.replace(/^[–-]\s*/, ""),
        groups: noticeGroups.size ? [...noticeGroups] : "all",
        dates: [...noticeDates].sort(),
        reason: (reviewReasons.length ? reviewReasons : infoReasons).join("; "),
        firstSeen: entry.firstSeen,
        removedAt: entry.removedAt,
      });
    }
  }
}

function loadDecisions(): Decision[] {
  if (!fs.existsSync(DECISIONS_PATH)) return [];
  const parsed = YAML.parse(fs.readFileSync(DECISIONS_PATH, "utf8")) as { decisions?: Decision[] } | null;
  return parsed?.decisions ?? [];
}

export function applyDecisions(activities: Map<string, PublishedActivity>, notices: Notice[], events: SchoolEvent[], decisions: Decision[]): string[] {
  const problems: string[] = [];
  for (const d of decisions) {
    if ("event" in d) {
      const idx = events.findIndex((e) => e.id === String(d.event));
      if (idx < 0) {
        problems.push(`Decyzja dotyczy nieistniejącego wydarzenia: ${d.event}`);
        continue;
      }
      if (d.action === "hide") {
        events.splice(idx, 1);
        continue;
      }
      const e = events[idx]!;
      if (d.action === "edit") Object.assign(e, d.set);
      e.verification = "verified";
      e.reviewReasons = [];
      continue;
    }
    if ("notice" in d) {
      const idx = notices.findIndex((n) => n.id.startsWith(String(d.notice)));
      if (idx < 0) problems.push(`Decyzja dotyczy nieistniejącego komunikatu: ${d.notice}`);
      else notices.splice(idx, 1);
      continue;
    }
    const a = activities.get(String(d.id));
    if (!a) {
      problems.push(`Decyzja dotyczy nieistniejącego terminu: ${d.id}`);
      continue;
    }
    if (d.action === "hide") {
      activities.delete(a.id);
      continue;
    }
    if (d.action === "edit") {
      if ((d.set.date && d.set.date !== a.date) || (d.set.start && d.set.start !== a.start)) {
        a.previous ??= { date: a.date, start: a.start, end: a.end };
      }
      Object.assign(a, d.set);
    }
    a.verification = "verified";
    a.reviewReasons = [];
    a.sources.push({ type: "manual", note: d.note ?? null });
  }
  return problems;
}

const STATUS_PL: Record<Status, string> = { scheduled: "zaplanowane", cancelled: "odwołane", rescheduled: "przeniesione", additional: "dodatkowe" };

function writePending(schedule: PublishedSchedule, problems: string[], skippedEventText: { file: string; text: string }[] = []) {
  const name = (id: string) => schedule.groups.find((g) => g.id === id)?.name ?? id;
  const review = schedule.activities.filter((a) => a.verification === "needs_review");
  const lines = [
    "# Do weryfikacji",
    "",
    "Plik generowany automatycznie przy każdej synchronizacji – nie edytuj go.",
    "Decyzje wpisuj w `review/decisions.yaml` (instrukcja na górze tamtego pliku).",
    "",
  ];
  if (problems.length) {
    lines.push("## Problemy", "", ...problems.map((p) => `- ${p}`), "");
  }
  const reviewEvents = (schedule.events ?? []).filter((e) => e.verification === "needs_review");
  lines.push(`## Wydarzenia przedszkolne (${reviewEvents.length})`, "");
  lines.push("Niepublikowane do czasu decyzji.", "");
  if (reviewEvents.length === 0) lines.push("Brak.", "");
  for (const e of reviewEvents) {
    lines.push(
      `### ${e.date}${e.endDate ? `–${e.endDate}` : ""}${e.start ? ` ${e.start}` : ""} · ${name(e.group)} · ${e.title}`,
      "",
      ...(e.details ? [`- Opis: ${e.details}`] : []),
      ...e.reviewReasons.map((r) => `- Powód: ${r}`),
      `- Plik: \`${e.source}\``,
      "",
      "```yaml",
      `  - event: ${e.id}`,
      "    action: confirm   # albo: hide / edit (z polem set: date, endDate, start, end, title, details)",
      "```",
      "",
    );
  }
  if (skippedEventText.length) {
    lines.push("Pominięte zdania z wiadomości (nie są wydarzeniami – sprawdź, czy nic nie umknęło):", "");
    lines.push(...skippedEventText.map((s) => `- „${s.text}” (\`${s.file}\`)`), "");
  }
  lines.push(`## Terminy (${review.length})`, "");
  if (review.length === 0) lines.push("Brak.", "");
  for (const a of review) {
    lines.push(
      `### ${a.date} ${a.start ?? "?"}–${a.end ?? "?"} · ${name(a.group)} · ${a.activity}`,
      "",
      `- Status: ${STATUS_PL[a.status]}${a.teacher ? `, prowadzi ${a.teacher}` : ""}`,
      ...a.reviewReasons.map((r) => `- Powód: ${r}`),
      ...a.sources.map((s) =>
        s.type === "schedule" ? `- Tabela: „${s.cellText ?? ""}” ([plik](${s.url}))` : s.type === "announcement" ? `- Ogłoszenie: „${s.text}”` : "- Decyzja ręczna",
      ),
      "",
      "```yaml",
      `  - id: ${a.id}`,
      "    action: confirm   # albo: hide / edit (z polem set)",
      "```",
      "",
    );
  }
  // Komunikaty informacyjne (np. „zaktualizowano tabelę”) nie wymagają decyzji.
  const unmatched = schedule.notices.filter((n) => n.kind === "review");
  lines.push(`## Komunikaty bez dopasowania (${unmatched.length})`, "");
  lines.push("Pokazywane rodzicom jako tekst ogłoszenia, bez zmiany statusu terminów.", "");
  if (unmatched.length === 0) lines.push("Brak.", "");
  for (const n of unmatched) {
    lines.push(
      `### „${n.text}”`,
      "",
      `- Grupy: ${n.groups === "all" ? "wszystkie" : n.groups.map(name).join(", ")}`,
      `- Powód: ${n.reason}`,
      "",
      "```yaml",
      `  - notice: ${n.id}`,
      "    action: dismiss   # ukryj komunikat",
      "```",
      "",
    );
  }
  fs.mkdirSync(path.dirname(PENDING_PATH), { recursive: true });
  fs.writeFileSync(PENDING_PATH, lines.join("\n"), "utf8");
}

export function build(): { schedule: PublishedSchedule; published: PublishedSchedule; problems: string[]; historyEvents: number } {
  const config = loadGroups();
  const { occurrences, disagreements } = loadConsensus();
  const docs = allDocuments();
  // Ten sam termin w starej i nowej wersji tabeli – źródłem karty ma być aktualny plik.
  const removedAt = new Map(docs.map((d) => [d.sha256, d.removedAt]));
  const currentFirst = [...occurrences].sort((a, b) => Number(!!removedAt.get(a.sourceSha256)) - Number(!!removedAt.get(b.sourceSha256)));

  const activities = new Map<string, PublishedActivity>();
  for (const o of currentFirst) {
    const a = fromSchedule(o);
    if (!activities.has(a.id)) activities.set(a.id, a);
  }
  // Rozbieżne odczyty publikujemy, ale jako niezweryfikowane.
  for (const o of disagreements) {
    const a = fromSchedule(o, ["runs_disagree"]);
    if (!activities.has(a.id)) activities.set(a.id, a);
  }
  applyTableReplacements(activities, occurrences, docs);

  const indexPath = path.join(ANNOUNCEMENTS_DIR, "index.json");
  const index = fs.existsSync(indexPath) ? readJson<Record<string, { text: string; firstSeen: string; removedAt: string | null }>>(indexPath) : {};
  const records = Object.keys(index).map((h) => readJson<AnnouncementRecord>(path.join(ANNOUNCEMENTS_DIR, `${h}.json`)));
  const entries = resolveAll(records, index, occurrences);

  const notices: Notice[] = [];
  applyAnnouncements(activities, entries, notices, occurrences);
  const loaded = loadEvents();
  const events = loaded.events;
  const problems = [...loaded.problems, ...applyDecisions(activities, notices, events, loadDecisions())];

  const order = (a: PublishedActivity) => `${a.date} ${a.start ?? "99:99"} ${config.groups.findIndex((g) => g.id === a.group)}`;
  // Pełny stan wszystkich grup i miesięcy – do weryfikacji i historii (nie publikujemy go).
  const schedule: PublishedSchedule = {
    sourcePage: SOURCE_PAGE_URL,
    groups: config.groups.map((g) => ({ id: g.id, name: g.name })),
    activities: [...activities.values()].sort((a, b) => order(a).localeCompare(order(b))),
    notices,
    events: events.sort((a, b) => `${a.date} ${a.start ?? ""}`.localeCompare(`${b.date} ${b.start ?? ""}`)),
  };
  writePending(schedule, problems, loaded.skipped);
  const historyEvents = updateHistory(schedule.activities);

  const published = publicView(schedule, config.publicGroups, currentMonthKey());
  writeJson(PUBLISHED_PATH, published);
  return { schedule, published, problems, historyEvents };
}

/** Bieżący miesiąc (RRRR-MM) w strefie Europe/Warsaw. */
function currentMonthKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

/**
 * To, co widzą rodzice: tylko grupy z publicGroups i tylko bieżący miesiąc
 * (termin przeniesiony z/do tego miesiąca też się liczy).
 */
function publicView(full: PublishedSchedule, groups: string[], month: string): PublishedSchedule {
  const inMonth = (d: string) => d.startsWith(month);
  return {
    sourcePage: full.sourcePage,
    groups: full.groups.filter((g) => groups.includes(g.id)),
    activities: full.activities.filter((a) => groups.includes(a.group) && (inMonth(a.date) || (a.previous !== null && inMonth(a.previous.date)))),
    notices: full.notices.filter(
      (n) => (n.groups === "all" || n.groups.some((g) => groups.includes(g))) && (n.dates.length === 0 || n.dates.some(inMonth)),
    ),
    // Wydarzenia przedszkolne: tylko potwierdzone, w tym miesiącu (także wielodniowe zachodzące na miesiąc).
    events: (full.events ?? []).filter(
      (e) => e.verification === "verified" && groups.includes(e.group) && e.date.slice(0, 7) <= month && (e.endDate ?? e.date).slice(0, 7) >= month,
    ),
  };
}

if (isMain(import.meta.url)) {
  const { schedule, published, problems, historyEvents } = build();
  console.log(`Publicznie: ${published.groups.map((g) => g.name).join(", ")} – ${published.activities.length} terminów, ${published.notices.length} komunikatów`);
  console.log(`Historia: ${historyEvents} nowych zdarzeń`);
  const count = (s: Status) => schedule.activities.filter((a) => a.status === s).length;
  console.log(
    `Terminów: ${schedule.activities.length} (zaplanowane ${count("scheduled")}, odwołane ${count("cancelled")}, ` +
      `przeniesione ${count("rescheduled")}, dodatkowe ${count("additional")})`,
  );
  console.log(`Do weryfikacji: ${schedule.activities.filter((a) => a.verification === "needs_review").length}, komunikatów bez dopasowania: ${schedule.notices.filter((n) => n.kind === "review").length}`);
  for (const p of problems) console.log(`UWAGA: ${p}`);
}
