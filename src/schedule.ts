// Wczytuje odczyty harmonogramu z data/extractions i zamienia je na terminy.
import fs from "node:fs";
import { MANIFEST_PATH, loadGroups, readJson } from "./config.js";
import type { Manifest, SourceDocument } from "./discover.js";
import { RUNS, extractionPath } from "./extract.js";
import { expandEntry, markTimeConflicts, parseMonthLabel, sameActivity, sameTeacher, type CellEntry, type EntryResult, type Occurrence } from "./normalize.js";
import type { ExtractionRecord } from "./schema.js";

export interface ScheduledOccurrence extends Occurrence {
  sourceUrl: string;
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

export function activeDocuments(): SourceDocument[] {
  return readJson<Manifest>(MANIFEST_PATH).documents.filter((d) => d.removedAt === null);
}

export function loadRun(run: string, docs = activeDocuments()): RunResult {
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
  // Miesiąc jest tylko w nagłówku pierwszej strony – bierzemy go z dowolnej strony zestawu.
  const period = records.map((r) => parseMonthLabel(r.output.month_label)).find(Boolean) ?? null;

  const cells: RunResult["cells"] = [];
  if (period) {
    for (const rec of records) {
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
        cells.push({ ...expandEntry(entry, period.year, period.month, config), sourceUrl: rec.documentUrl, entry });
      }
    }
  }
  const occurrences = cells.flatMap((c) =>
    c.occurrences.map((o) => ({ ...o, sourceUrl: c.sourceUrl, cellText: c.entry.cellText ?? null })),
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
