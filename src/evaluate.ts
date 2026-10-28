// M0: porównuje odczyty Claude ze wzorcem przepisanym ręcznie
// i sprawdza, czy walidacja wyłapuje znane problemy w źródle.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, MANIFEST_PATH, ROOT, loadGroups, readJson, writeJson } from "./config.js";
import type { Manifest } from "./discover.js";
import { PRICE_PER_MTOK, RUNS, extractionPath } from "./extract.js";
import { expandEntry, markTimeConflicts, parseMonthLabel, sameActivity, sameTeacher, type CellEntry, type EntryResult, type Occurrence } from "./normalize.js";
import type { ExtractionRecord } from "./schema.js";

interface GoldenEntry {
  page: number;
  activity: string;
  teacher: string;
  groups: string[];
  weekday: string;
  start: string | null;
  end: string | null;
  dates: string[];
  location: string | null;
  subgroup: string | null;
  expectIssue?: string;
}

interface Golden {
  year: number;
  month: number;
  entries: GoldenEntry[];
}

const config = loadGroups();
const golden = readJson<Golden>(path.join(ROOT, "test", "golden", "2026-10.json"));
const manifest = readJson<Manifest>(MANIFEST_PATH);

/** Numer strony z nazwy pliku: …-0-scaled.jpg → 0 */
function pageIndex(url: string): number {
  return Number(url.match(/-(\d+)(?:-scaled)?\.\w+$/)?.[1] ?? -1);
}

function expandGolden(): { occurrences: Occurrence[]; cells: (GoldenEntry & { group: string })[] } {
  const occurrences: Occurrence[] = [];
  const cells: (GoldenEntry & { group: string })[] = [];
  for (const e of golden.entries) {
    for (const group of e.groups) {
      const name = config.groups.find((g) => g.id === group)!.name;
      const res = expandEntry({ ...e, groupLabel: name }, golden.year, golden.month, config);
      occurrences.push(...res.occurrences);
      cells.push({ ...e, group });
    }
  }
  return { occurrences, cells };
}

function expandRun(run: string) {
  const results: (EntryResult & { page: number; entry: CellEntry })[] = [];
  let usage = { input: 0, output: 0 };
  let missingFiles = 0;
  const docs = manifest.documents.filter((d) => d.removedAt === null);
  const records = docs.flatMap((doc) => {
    const file = extractionPath(doc, run);
    if (!fs.existsSync(file)) {
      missingFiles++;
      return [];
    }
    return [readJson<ExtractionRecord>(file)];
  });
  // Miesiąc jest tylko w nagłówku pierwszej strony – bierzemy go z dowolnej strony zestawu.
  const period = records.map((r) => parseMonthLabel(r.output.month_label)).find(Boolean) ?? null;

  for (const rec of records) {
    usage.input += rec.usage.input_tokens;
    usage.output += rec.usage.output_tokens;
    if (!period) continue;
    for (const e of rec.output.entries) {
      const entry: CellEntry = {
        activity: e.activity_name,
        teacher: e.teacher,
        groupLabel: e.group_column,
        weekday: e.weekday,
        start: e.start,
        end: e.end,
        dates: e.dates,
        location: e.location,
        subgroup: e.subgroup,
        cellText: e.cell_text,
        uncertain: e.uncertain,
        note: e.note,
      };
      results.push({ ...expandEntry(entry, period.year, period.month, config), page: pageIndex(rec.documentUrl), entry });
    }
  }
  return { results, period, usage, missingFiles, records };
}

function pct(n: number, d: number): string {
  return d === 0 ? "–" : `${((100 * n) / d).toFixed(1)}%`;
}

/**
 * Paruje terminy z dwóch list: ta sama grupa, data i godzina oraz ta sama nazwa zajęć.
 * Sama godzina nie wystarcza – w źródle zdarzają się dwa zajęcia jednocześnie.
 */
function pair(left: Occurrence[], right: Occurrence[]) {
  const unused = [...right];
  const pairs: [Occurrence, Occurrence][] = [];
  const onlyLeft: Occurrence[] = [];
  for (const l of left) {
    const idx = unused.findIndex((r) => r.key === l.key && sameActivity(r.activity, l.activity));
    if (idx < 0) onlyLeft.push(l);
    else pairs.push([l, unused.splice(idx, 1)[0]!]);
  }
  return { pairs, onlyLeft, onlyRight: unused };
}

const label = (o: Occurrence) => `${o.key} ${o.activity.slice(0, 40)}`;

const gold = expandGolden();
markTimeConflicts(gold.occurrences);
const report: Record<string, unknown> = { goldenOccurrences: gold.occurrences.length };
const runOccurrences: Record<string, Occurrence[]> = {};
let totalCost = 0;

console.log(`Wzorzec: ${gold.occurrences.length} terminów w ${golden.entries.length} komórkach (${golden.month}.${golden.year})\n`);

for (const run of RUNS) {
  const { results, period, usage, missingFiles, records } = expandRun(run);
  if (records.length === 0) {
    console.log(`Przebieg ${run}: brak odczytów – uruchom najpierw "npm run extract".`);
    continue;
  }
  const cost = (usage.input * PRICE_PER_MTOK.input + usage.output * PRICE_PER_MTOK.output) / 1e6;
  totalCost += cost;
  const occ = results.flatMap((r) => r.occurrences);
  markTimeConflicts(occ);
  runOccurrences[run] = occ;

  const { pairs, onlyLeft: missing, onlyRight: extra } = pair(gold.occurrences, occ);
  const fieldErrors: string[] = [];
  const issueDiffs: string[] = [];
  for (const [g, o] of pairs) {
    if (o.end !== g.end) fieldErrors.push(`${label(g)}: koniec ${o.end} ≠ ${g.end}`);
    if (!sameActivity(o.activity, g.activity)) fieldErrors.push(`${label(g)}: zajęcia „${o.activity}”`);
    if (!sameTeacher(o.teacher, g.teacher)) fieldErrors.push(`${label(g)}: prowadzący „${o.teacher}” ≠ „${g.teacher}”`);
    if ((o.subgroup ?? null) !== (g.subgroup ?? null)) fieldErrors.push(`${label(g)}: podgrupa „${o.subgroup}” ≠ „${g.subgroup}”`);
    const gi = [...g.issues].sort().join(",");
    const oi = [...o.issues].sort().join(",");
    if (gi !== oi) issueDiffs.push(`${label(g)}: odczyt [${oi}] ≠ wzorzec [${gi}]`);
  }

  // Komórki bez terminów (np. tylko dzień tygodnia) – czy zostały oznaczone jako niepełne?
  const expectations = gold.cells.filter((c) => c.expectIssue === "incomplete").map((c) => ({
    group: c.group,
    activity: c.activity,
    expected: c.expectIssue,
    flagged: results.some((r) => r.group === c.group && r.issues.includes("incomplete") && sameActivity(r.entry.activity, c.activity)),
  }));

  console.log(`=== Przebieg ${run} (${records.length} stron, okres: ${period ? `${period.month}.${period.year}` : "NIEZNANY"}) ===`);
  if (missingFiles) console.log(`  Uwaga: brak odczytu dla ${missingFiles} plików`);
  console.log(`  Znalezione terminy wzorca (recall): ${pairs.length}/${gold.occurrences.length} = ${pct(pairs.length, gold.occurrences.length)}`);
  console.log(`  Terminy zgodne ze wzorcem (precision): ${pairs.length}/${occ.length} = ${pct(pairs.length, occ.length)}`);
  console.log(`  Błędy pól w dopasowanych terminach: ${fieldErrors.length}`);
  for (const e of fieldErrors) console.log(`    - ${e}`);
  for (const m of missing) console.log(`  BRAK: ${label(m)}`);
  for (const x of extra) console.log(`  NADMIAROWY: ${label(x)} [${x.issues.join(", ")}]`);
  console.log(`  Oznaczenia walidacji zgodne ze wzorcem: ${issueDiffs.length === 0 ? "tak" : `NIE (${issueDiffs.length} różnic)`}`);
  for (const d of issueDiffs) console.log(`    - ${d}`);
  for (const e of expectations) console.log(`  Niepełna komórka ${e.flagged ? "WYKRYTA" : "NIEWYKRYTA"}: ${e.group}, ${e.activity}`);
  console.log(`  Koszt: ${usage.input} + ${usage.output} tokenów = $${cost.toFixed(3)}\n`);

  report[run] = {
    period,
    recall: pairs.length / gold.occurrences.length,
    precision: occ.length ? pairs.length / occ.length : null,
    missing: missing.map(label),
    extra: extra.map(label),
    fieldErrors,
    issueDiffs,
    expectations,
    usage,
    costUsd: cost,
  };
}

if (runOccurrences.a && runOccurrences.b) {
  const { pairs, onlyLeft, onlyRight } = pair(runOccurrences.a, runOccurrences.b);
  const differing = pairs.filter(([a, b]) => a.end !== b.end || !sameTeacher(a.teacher, b.teacher) || !sameActivity(a.activity, b.activity));
  const total = onlyLeft.length + onlyRight.length + differing.length;
  console.log(`=== Zgodność przebiegów a i b: ${total === 0 ? "pełna" : `${total} różnic`} ===`);
  for (const o of onlyLeft) console.log(`  tylko w a: ${label(o)}`);
  for (const o of onlyRight) console.log(`  tylko w b: ${label(o)}`);
  for (const [a, b] of differing) console.log(`  różne pola: ${label(a)} / ${label(b)}`);
  report.disagreements = { onlyA: onlyLeft.map(label), onlyB: onlyRight.map(label), differing: differing.map(([a]) => label(a)) };
}

console.log(`\nProblemy w źródle wykryte przez walidację (na wzorcu):`);
for (const f of [...new Set(gold.occurrences.flatMap((o) => o.issues.map((i) => `${i}: ${o.group}, ${o.activity.slice(0, 45)}, ${o.date}`)))]) console.log(`  - ${f}`);
console.log(`\nŁączny koszt odczytów: $${totalCost.toFixed(3)}`);
writeJson(path.join(DATA_DIR, "m0-report.json"), report);
