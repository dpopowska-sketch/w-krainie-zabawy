// Dopasowanie zmian z ogłoszeń do terminów z harmonogramu. Bez AI.
// Zasada: zmiana jest stosowana tylko przy jednoznacznym dopasowaniu.
// W każdym innym przypadku trafia do weryfikacji i niczego nie zmienia.
import { findGroup, type GroupsConfig } from "./config.js";
import { fold, normalizeTime } from "./normalize.js";
import type { ScheduledOccurrence } from "./schedule.js";
import type { AnnouncedChange } from "./schema.js";

export type Effect =
  | { kind: "cancel"; target: ScheduledOccurrence }
  | { kind: "reschedule"; target: ScheduledOccurrence; date: string; start: string | null; end: string | null }
  | { kind: "time_change"; target: ScheduledOccurrence; start: string; end: string | null }
  | { kind: "add"; group: string; activity: string; teacher: string | null; date: string; start: string | null; end: string | null };

export type Resolution =
  | { status: "applied"; effects: Effect[]; activity: string; groups: string[] | "all" }
  | { status: "needs_review"; reason: string; candidates?: string[] };

const STOPWORDS = new Set(["zajecia", "zajec", "z", "dla", "i", "w", "oraz", "grupa", "grupy", "gr"]);

function tokens(text: string): string[] {
  return fold(text)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t));
}

/** Tokeny zgadzają się, jeśli mają wspólny początek (odporność na odmianę: „preorientacji” / „preorientacja”). */
function tokenMatches(ref: string, name: string): boolean {
  if (ref.length <= 3) return ref === name;
  return name.startsWith(ref.slice(0, 5));
}

/** Rozwija skróty z konfiguracji, np. „kk” → „kompetencje kluczowe”. */
function expandAliases(ref: string, config: GroupsConfig): string {
  return ref
    .split(/\s+/)
    .map((w) => config.activityAliases[w.toLocaleLowerCase("pl")] ?? w)
    .join(" ");
}

/** Nazwy zajęć z harmonogramu, których dotyczy odwołanie (każde słowo odwołania musi wystąpić w nazwie). */
export function matchActivities(ref: string, names: string[], config: GroupsConfig): string[] {
  const refTokens = tokens(expandAliases(ref, config));
  if (refTokens.length === 0) return [];
  return names.filter((name) => {
    const nameTokens = tokens(name);
    return refTokens.every((r) => nameTokens.some((n) => tokenMatches(r, n)));
  });
}

/** „Sówki” → [sowki]; „Miki” → [motylki, wilczki]; nieznane → null. */
export function resolveGroupRef(ref: string, config: GroupsConfig): string[] | null {
  const clean = ref.replace(/^(grupa|gr\.?)\s+/i, "").trim();
  const group = findGroup(config, clean);
  if (group) return [group.id];
  const location = Object.entries(config.locations).find(([name]) => fold(name) === fold(clean));
  if (location) return location[1];
  const byPrefix = config.groups.filter((g) => fold(g.name).slice(0, 4) === fold(clean).slice(0, 4));
  return byPrefix.length === 1 ? [byPrefix[0]!.id] : null;
}

export function resolveChange(change: AnnouncedChange, schedule: ScheduledOccurrence[], config: GroupsConfig): Resolution {
  if (change.type === "other") return { status: "needs_review", reason: "Nierozpoznany rodzaj zmiany" };
  if (change.uncertain) return { status: "needs_review", reason: `Ogłoszenie niejednoznaczne: ${change.note ?? ""}`.trim() };
  if (change.dates.length === 0) return { status: "needs_review", reason: "Ogłoszenie nie podaje daty" };
  if (!change.activity_ref) return { status: "needs_review", reason: "Ogłoszenie nie podaje nazwy zajęć" };

  // Grupy: podane wprost, przez miejsce (np. „Miki”) albo – gdy brak – wszystkie.
  let groups: string[] | "all" = "all";
  if (change.group_refs.length > 0) {
    const resolved = change.group_refs.map((r) => ({ ref: r, ids: resolveGroupRef(r, config) }));
    const unknown = resolved.filter((r) => !r.ids).map((r) => r.ref);
    if (unknown.length) return { status: "needs_review", reason: `Nieznana grupa: ${unknown.join(", ")}` };
    groups = [...new Set(resolved.flatMap((r) => r.ids!))];
  }
  const inGroups = (o: ScheduledOccurrence) => groups === "all" || groups.includes(o.group);

  // Zajęcia to wiersz tabeli – szukamy w całym harmonogramie, bo komórka danej grupy może być pusta
  // (np. dodatkowe zajęcia dla grupy, która w tym miesiącu nie miała terminów).
  const names = [...new Set(schedule.map((o) => o.activity))];
  const activities = matchActivities(change.activity_ref, names, config);
  if (activities.length === 0) return { status: "needs_review", reason: `Nie znaleziono zajęć „${change.activity_ref}” w harmonogramie` };
  if (activities.length > 1) {
    return { status: "needs_review", reason: `„${change.activity_ref}” pasuje do kilku zajęć`, candidates: activities };
  }
  const activity = activities[0]!;

  if (change.type === "additional") {
    if (groups === "all") return { status: "needs_review", reason: "Dodatkowe zajęcia bez podanej grupy" };
    const start = normalizeTime(change.new_start);
    const end = normalizeTime(change.new_end);
    if (!start) return { status: "needs_review", reason: "Dodatkowe zajęcia bez godziny" };
    const effects: Effect[] = [];
    for (const group of groups) {
      // Prowadzący tych samych zajęć – najpierw w tej grupie, potem w całym harmonogramie (o ile jest jeden).
      const sameActivity = schedule.filter((o) => o.activity === activity);
      const inGroup = sameActivity.filter((o) => o.group === group);
      const teachers = [...new Set((inGroup.length ? inGroup : sameActivity).map((o) => o.teacher))];
      for (const date of change.dates) {
        effects.push({ kind: "add", group, activity, teacher: teachers.length === 1 ? teachers[0]! : null, date, start, end });
      }
    }
    return { status: "applied", effects, activity, groups };
  }

  const targets = schedule.filter((o) => inGroups(o) && o.activity === activity && change.dates.includes(o.date));
  if (targets.length === 0) {
    return { status: "needs_review", reason: `Brak terminu „${activity}” w dniu ${change.dates.join(", ")} w harmonogramie` };
  }
  // Każda data z ogłoszenia musi mieć swój termin – inaczej coś jest nie tak (np. błędna data).
  const unmatchedDates = change.dates.filter((d) => !targets.some((t) => t.date === d));
  if (unmatchedDates.length) return { status: "needs_review", reason: `Brak terminu w dniu ${unmatchedDates.join(", ")}` };

  if (change.type === "cancelled") {
    return { status: "applied", effects: targets.map((target) => ({ kind: "cancel", target })), activity, groups };
  }
  if (change.type === "time_changed") {
    const start = normalizeTime(change.new_start);
    if (!start) return { status: "needs_review", reason: "Zmiana godziny bez nowej godziny" };
    return { status: "applied", effects: targets.map((target) => ({ kind: "time_change", target, start, end: normalizeTime(change.new_end) })), activity, groups };
  }
  // rescheduled
  if (!change.new_date) return { status: "needs_review", reason: "Przeniesienie bez nowej daty" };
  return {
    status: "applied",
    effects: targets.map((target) => ({
      kind: "reschedule",
      target,
      date: change.new_date!,
      start: normalizeTime(change.new_start) ?? target.start,
      end: normalizeTime(change.new_end) ?? target.end,
    })),
    activity,
    groups,
  };
}
