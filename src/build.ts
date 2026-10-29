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
import { fold, type IssueCode } from "./normalize.js";
import { resolveGroupRef } from "./resolve.js";
import { loadConsensus, type ScheduledOccurrence } from "./schedule.js";
import type { AnnouncementRecord } from "./schema.js";

export const PUBLISHED_PATH = path.join(DATA_DIR, "published", "schedule.json");
const DECISIONS_PATH = path.join(ROOT, "review", "decisions.yaml");
const PENDING_PATH = path.join(ROOT, "review", "pending.md");
const ANNOUNCEMENTS_DIR = path.join(DATA_DIR, "announcements");

export type Status = "scheduled" | "cancelled" | "rescheduled" | "additional";

export type Source =
  | { type: "schedule"; url: string; cellText: string | null; firstSeen: string }
  | { type: "announcement"; text: string; firstSeen: string; removedAt: string | null }
  | { type: "manual"; note: string | null };

export interface PublishedActivity {
  id: string;
  group: string;
  activity: string;
  teacher: string | null;
  date: string;
  start: string | null;
  end: string | null;
  location: string | null;
  subgroup: string | null;
  status: Status;
  previous: { date: string; start: string | null; end: string | null } | null;
  verification: "verified" | "needs_review";
  reviewReasons: string[];
  warnings: string[];
  sources: Source[];
  updatedAt: string;
}

export interface Notice {
  id: string;
  text: string;
  groups: string[] | "all";
  reason: string;
  firstSeen: string;
  removedAt: string | null;
}

export interface PublishedSchedule {
  sourcePage: string;
  groups: { id: string; name: string }[];
  activities: PublishedActivity[];
  notices: Notice[];
}

type Decision =
  | { id: string; action: "confirm"; note?: string }
  | { id: string; action: "hide"; note?: string }
  | { id: string; action: "edit"; set: Partial<Pick<PublishedActivity, "date" | "start" | "end" | "teacher" | "activity" | "status">>; note?: string }
  | { notice: string; action: "dismiss"; note?: string };

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

function applyAnnouncements(activities: Map<string, PublishedActivity>, entries: ChangeEntry[], notices: Notice[]) {
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
    const noticeGroups = new Set<string>();
    for (const { change, resolution } of entry.changes) {
      if (resolution.status === "needs_review") {
        reviewReasons.push(resolution.reason);
        for (const ref of change.group_refs) for (const g of resolveGroupRef(ref, config) ?? []) noticeGroups.add(g);
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
    if (reviewReasons.length) {
      notices.push({
        id: entry.textSha256.slice(0, 12),
        text: entry.text.replace(/^[–-]\s*/, ""),
        groups: noticeGroups.size ? [...noticeGroups] : "all",
        reason: reviewReasons.join("; "),
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

function applyDecisions(activities: Map<string, PublishedActivity>, notices: Notice[], decisions: Decision[]): string[] {
  const problems: string[] = [];
  for (const d of decisions) {
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

function writePending(schedule: PublishedSchedule, problems: string[]) {
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
    lines.push("## Problemy z decyzjami", "", ...problems.map((p) => `- ${p}`), "");
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
  lines.push(`## Komunikaty bez dopasowania (${schedule.notices.length})`, "");
  lines.push("Pokazywane rodzicom jako tekst ogłoszenia, bez zmiany statusu terminów.", "");
  if (schedule.notices.length === 0) lines.push("Brak.", "");
  for (const n of schedule.notices) {
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

export function build(): { schedule: PublishedSchedule; problems: string[] } {
  const config = loadGroups();
  const { occurrences, disagreements } = loadConsensus();

  const activities = new Map<string, PublishedActivity>();
  for (const o of occurrences) {
    const a = fromSchedule(o);
    if (!activities.has(a.id)) activities.set(a.id, a);
  }
  // Rozbieżne odczyty publikujemy, ale jako niezweryfikowane.
  for (const o of disagreements) {
    const a = fromSchedule(o, ["runs_disagree"]);
    if (!activities.has(a.id)) activities.set(a.id, a);
  }

  const indexPath = path.join(ANNOUNCEMENTS_DIR, "index.json");
  const index = fs.existsSync(indexPath) ? readJson<Record<string, { text: string; firstSeen: string; removedAt: string | null }>>(indexPath) : {};
  const records = Object.keys(index).map((h) => readJson<AnnouncementRecord>(path.join(ANNOUNCEMENTS_DIR, `${h}.json`)));
  const entries = resolveAll(records, index, occurrences);

  const notices: Notice[] = [];
  applyAnnouncements(activities, entries, notices);
  const problems = applyDecisions(activities, notices, loadDecisions());

  const order = (a: PublishedActivity) => `${a.date} ${a.start ?? "99:99"} ${config.groups.findIndex((g) => g.id === a.group)}`;
  const schedule: PublishedSchedule = {
    sourcePage: SOURCE_PAGE_URL,
    groups: config.groups.map((g) => ({ id: g.id, name: g.name })),
    activities: [...activities.values()].sort((a, b) => order(a).localeCompare(order(b))),
    notices,
  };
  writeJson(PUBLISHED_PATH, schedule);
  writePending(schedule, problems);
  return { schedule, problems };
}

if (isMain(import.meta.url)) {
  const { schedule, problems } = build();
  const count = (s: Status) => schedule.activities.filter((a) => a.status === s).length;
  console.log(
    `Terminów: ${schedule.activities.length} (zaplanowane ${count("scheduled")}, odwołane ${count("cancelled")}, ` +
      `przeniesione ${count("rescheduled")}, dodatkowe ${count("additional")})`,
  );
  console.log(`Do weryfikacji: ${schedule.activities.filter((a) => a.verification === "needs_review").length}, komunikatów bez dopasowania: ${schedule.notices.length}`);
  for (const p of problems) console.log(`UWAGA: ${p}`);
}
