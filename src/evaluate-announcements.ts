// M3: porównuje przetworzenie ogłoszeń ze wzorcem test/golden/announcements-2026-10.json.
// Wymaga wcześniejszego "npm run announcements" (korzysta z cache interpretacji).
import path from "node:path";
import { ROOT, readJson } from "./config.js";
import { describeEffect, processAnnouncements } from "./announcements.js";
import { fold } from "./normalize.js";
import type { Effect } from "./resolve.js";

interface ExpectedEffect {
  kind: string;
  group: string;
  date: string;
  activity: string;
  start?: string;
  end?: string;
}

interface Case {
  match: string;
  isScheduleChange: boolean;
  status?: "applied" | "needs_review";
  effects?: ExpectedEffect[];
}

/** Efekt w jednej płaskiej postaci: grupa i data terminu, którego dotyczy, oraz godziny po zmianie. */
function flatten(effect: Effect): ExpectedEffect {
  const d = describeEffect(effect);
  if (d.kind === "add") return { kind: d.kind, group: d.group, date: d.date, activity: d.activity, start: d.start ?? undefined, end: d.end ?? undefined };
  const { group, date, activity, start, end } = d.target;
  if (d.kind === "cancel") return { kind: d.kind, group, date, activity, start: start ?? undefined, end: end ?? undefined };
  return { kind: d.kind, group, date, activity, start: d.start ?? undefined, end: d.end ?? undefined };
}

const golden = readJson<{ cases: Case[] }>(path.join(ROOT, "test", "golden", "announcements-2026-10.json"));
const entries = await processAnnouncements();

let passed = 0;
console.log("\n=== Ocena przetwarzania ogłoszeń ===");
for (const c of golden.cases) {
  const entry = entries.find((e) => e.text.includes(c.match));
  const errors: string[] = [];
  if (!entry) errors.push("brak tej linii w danych ze strony");
  else {
    if (entry.isScheduleChange !== c.isScheduleChange) errors.push(`is_schedule_change = ${entry.isScheduleChange}`);
    if (c.isScheduleChange) {
      const resolutions = entry.changes.map((x) => x.resolution);
      const status = resolutions.every((r) => r.status === "applied") ? "applied" : "needs_review";
      if (status !== c.status) {
        const reasons = resolutions.flatMap((r) => (r.status === "needs_review" ? [r.reason] : []));
        errors.push(`status ${status} zamiast ${c.status}${reasons.length ? ` (${reasons.join("; ")})` : ""}`);
      }
      const unmatched = resolutions.flatMap((r) => (r.status === "applied" ? r.effects.map(flatten) : []));
      for (const exp of c.effects ?? []) {
        const idx = unmatched.findIndex(
          (a) =>
            a.kind === exp.kind &&
            a.group === exp.group &&
            a.date === exp.date &&
            fold(a.activity).includes(fold(exp.activity)) &&
            (!exp.start || a.start === exp.start) &&
            (!exp.end || a.end === exp.end),
        );
        if (idx < 0) errors.push(`brak efektu: ${exp.kind} ${exp.group} ${exp.date} ${exp.activity}`);
        else unmatched.splice(idx, 1);
      }
      for (const u of unmatched) errors.push(`nadmiarowy efekt: ${u.kind} ${u.group} ${u.date} ${u.activity.slice(0, 40)}`);
    }
  }
  if (errors.length === 0) passed++;
  console.log(`${errors.length === 0 ? "OK  " : "BŁĄD"} ${c.match.slice(0, 75)}`);
  for (const e of errors) console.log(`       - ${e}`);
}
console.log(`\nWynik: ${passed}/${golden.cases.length} przypadków zgodnych ze wzorcem`);
if (passed !== golden.cases.length) process.exitCode = 1;
