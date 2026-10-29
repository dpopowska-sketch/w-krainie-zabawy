// Wczytuje odczyty harmonogramu z data/extractions i zamienia je na terminy.
import fs from "node:fs";
import { MANIFEST_PATH, loadGroups, readJson } from "./config.js";
import type { Manifest, SourceDocument } from "./discover.js";
import { RUNS, extractionPath } from "./extract.js";
import { expandEntry, markTimeConflicts, parseMonthLabel, sameActivity, sameTeacher, type CellEntry, type EntryResult, type Occurrence } from "./normalize.js";
import type { ExtractionRecord } from "./schema.js";

export interface ScheduledOccurrence extends Occurrence {
  sourceUrl: string;
  /** Kiedy plik źródłowy (w tej wersji) pojawił się na stronie. */
  sourceFirstSeen: string;
  cellText: string | null;
}

export interface RunResult {
  run: string;
  records: ExtractionRecord[];
  missingFiles: number;
  period: { year: number; month: number } | null;
  cells: (EntryResult & { sourceUrl: string; entry: CellEntry })[];
  occurrences: ScheduledOccurrence[];
}

/**
 * Wszystkie dokumenty, także usunięte ze strony – ich terminy są historią i zostają.
 * Gdy plik pod tym samym adresem się zmienił, liczy się tylko najnowsza wersja.
 */
export function allDocuments(): SourceDocument[] {
  return readJson<Manifest>(MANIFEST_PATH).documents;
}

/**
 * Zestaw plików jednego harmonogramu: WordPress nadaje im wspólny początek nazwy
 * (…-0-scaled.jpg, …-1-scaled.jpg). Miesiąc jest zwykle tylko na pierwszej stronie.
 */
export function batchKey(url: string): string {
  return url.replace(/-\d+(?:-scaled)?\.\w+$/, "").replace(/(?:-scaled)?\.\w+$/, "");
}

/** Rok i miesiąc z adresu wgrania (/uploads/2026/10/) – tylko jako ostateczność. */
function uploadPeriod(url: string): { year: number; month: number } | null {
  const m = url.match(/\/uploads\/(\d{4})\/(\d{2})\//);
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
}

export function loadRun(run: string, docs = allDocuments()): RunResult {
  const config = loadGroups();
  let missingFiles = 0;
  const records = docs.flatMap((doc) => {
    const file = extractionPath(doc, run);
    if (!fs.existsSync(file)) {
      missingFiles++;
      return [];
    }
    return [readJson<ExtractionRecord>(file)];
  });

  const periods = new Map<string, { year: number; month: number; inferred: boolean }>();
  for (const rec of records) {
    const key = batchKey(rec.documentUrl);
    const parsed = parseMonthLabel(rec.output.month_label);
    if (parsed) periods.set(key, { ...parsed, inferred: false });
  }
  for (const rec of records) {
    const key = batchKey(rec.documentUrl);
    const fallback = uploadPeriod(rec.documentUrl);
    if (!periods.has(key) && fallback) periods.set(key, { ...fallback, inferred: true });
  }
  // Najnowszy okres – do kontekstu przy interpretacji ogłoszeń.
  const period = [...periods.values()].sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))[0] ?? null;

  const cells: RunResult["cells"] = [];
  for (const rec of records) {
    if (!rec.output.is_schedule) continue;
    const batchPeriod = periods.get(batchKey(rec.documentUrl));
    if (!batchPeriod) continue;
    {
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
        const result = expandEntry(entry, batchPeriod.year, batchPeriod.month, config);
        if (batchPeriod.inferred) for (const o of result.occurrences) o.issues.push("month_inferred");
        cells.push({ ...result, sourceUrl: rec.documentUrl, entry });
      }
    }
  }
  const firstSeen = new Map(docs.map((d) => [d.url, d.firstSeen]));
  const occurrences = cells.flatMap((c) =>
    c.occurrences.map((o) => ({ ...o, sourceUrl: c.sourceUrl, sourceFirstSeen: firstSeen.get(c.sourceUrl) ?? "", cellText: c.entry.cellText ?? null })),
  );
  markTimeConflicts(occurrences);
  return { run, records, missingFiles, period, cells, occurrences };
}

/** Ta sama grupa, data, godzina i nazwa zajęć. */
export function sameOccurrence(a: Occurrence, b: Occurrence): boolean {
  return a.key === b.key && sameActivity(a.activity, b.activity);
}

/**
 * Harmonogram uzgodniony z obu przebiegów odczytu.
 * Terminy, które wystąpiły tylko w jednym przebiegu lub różnią się polami,
 * nie są publikowane jako pewne – trafiają do listy rozbieżności.
 */
export function loadConsensus(): { occurrences: ScheduledOccurrence[]; disagreements: ScheduledOccurrence[]; period: RunResult["period"] } {
  const [first, ...rest] = RUNS.map((r) => loadRun(r));
  const occurrences: ScheduledOccurrence[] = [];
  const disagreements: ScheduledOccurrence[] = [];
  for (const occ of first!.occurrences) {
    const agreed = rest.every((r) =>
      r.occurrences.some((o) => sameOccurrence(o, occ) && o.end === occ.end && sameTeacher(o.teacher, occ.teacher)),
    );
    (agreed ? occurrences : disagreements).push(occ);
  }
  for (const r of rest) {
    for (const occ of r.occurrences) if (!first!.occurrences.some((o) => sameOccurrence(o, occ))) disagreements.push(occ);
  }
  return { occurrences, disagreements, period: first!.period };
}
