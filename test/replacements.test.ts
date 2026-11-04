// Testy podmiany pliku tabeli (src/build.ts, applyTableReplacements) – bez AI, na danych syntetycznych.
import assert from "node:assert/strict";
import { test } from "node:test";
import { activityId, applyTableReplacements, type PublishedActivity } from "../src/build.js";
import type { SourceDocument } from "../src/discover.js";
import type { ScheduledOccurrence } from "../src/schedule.js";

function doc(sha256: string, firstSeen: string, removedAt: string | null = null): SourceDocument {
  return { url: `https://x/${sha256}.jpg`, pageUrls: [], sha256, bytes: 0, contentType: "image/jpeg", file: "", lastModifiedHeader: null, firstSeen, removedAt, history: [] };
}

function occ(sha: string, group: string, date: string, start: string, activity = "Słowiki - śpiew"): ScheduledOccurrence {
  return {
    key: `${group}|${date}|${start}`,
    group,
    activity,
    teacher: "J. S.",
    date,
    start,
    end: null,
    location: null,
    subgroup: null,
    issues: [],
    sourceUrl: `https://x/${sha}.jpg`,
    sourceSha256: sha,
    sourceFirstSeen: "",
    cellText: null,
  };
}

function run(occurrences: ScheduledOccurrence[], docs: SourceDocument[]) {
  const activities = new Map<string, PublishedActivity>();
  for (const o of occurrences) {
    const id = activityId(o.group, o.date, o.start, o.activity);
    if (activities.has(id)) continue;
    activities.set(id, {
      id,
      group: o.group,
      activity: o.activity,
      teacher: o.teacher,
      date: o.date,
      start: o.start,
      end: o.end,
      location: null,
      subgroup: null,
      status: "scheduled",
      previous: null,
      verification: "verified",
      reviewReasons: [],
      warnings: [],
      sources: [],
      updatedAt: "",
    });
  }
  applyTableReplacements(activities, occurrences, docs);
  return [...activities.values()].sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
}

// Stara wersja wgrana 1.11, usunięta 3.11; nowa wgrana 3.11.
const OLD = doc("old", "2026-11-01T05:00:00Z", "2026-11-03T05:00:00Z");
const NEW = doc("new", "2026-11-03T05:00:00Z");

test("jeden termin zamiast dwóch → stary odwołany, nowe oznaczone", () => {
  const result = run([occ("old", "wilczki", "2026-11-05", "12:45"), occ("new", "wilczki", "2026-11-06", "12:45"), occ("new", "wilczki", "2026-11-13", "12:45")], [OLD, NEW]);
  assert.deepEqual(
    result.map((a) => [a.date, a.status, a.scheduleChange?.kind]),
    [
      ["2026-11-05", "cancelled", "removed"],
      ["2026-11-06", "scheduled", "added"],
      ["2026-11-13", "scheduled", "added"],
    ],
  );
});

test("jeden termin za jeden → przeniesione z poprzednią datą", () => {
  const result = run([occ("old", "sowki", "2026-11-12", "12:45"), occ("new", "sowki", "2026-11-05", "12:50")], [OLD, NEW]);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.status, "rescheduled");
  assert.deepEqual(result[0]!.previous, { date: "2026-11-12", start: "12:45", end: null });
  assert.equal(result[0]!.date, "2026-11-05");
});

test("ten sam dzień, inna godzina → zmiana godziny; reszta parowana osobno", () => {
  const result = run(
    [
      occ("old", "zabki", "2026-11-19", "12:45"),
      occ("old", "zabki", "2026-11-26", "12:45"),
      occ("old", "zabki", "2026-11-30", "12:45"),
      occ("new", "zabki", "2026-11-19", "07:30"),
      occ("new", "zabki", "2026-11-27", "07:30"),
    ],
    [OLD, NEW],
  );
  const moved = result.find((a) => a.date === "2026-11-19")!;
  assert.equal(moved.status, "rescheduled");
  assert.equal(moved.previous?.start, "12:45");
  // Zostają dwa stare i jeden nowy – nie zgadujemy, który przeniesiono.
  assert.equal(result.find((a) => a.date === "2026-11-26")?.status, "cancelled");
  assert.equal(result.find((a) => a.date === "2026-11-30")?.status, "cancelled");
  assert.equal(result.find((a) => a.date === "2026-11-27")?.scheduleChange?.kind, "added");
});

test("termin w obu wersjach i inne zajęcia → bez zmian", () => {
  const result = run([occ("old", "wilczki", "2026-11-06", "12:45"), occ("new", "wilczki", "2026-11-06", "12:45"), occ("new", "wilczki", "2026-11-10", "09:00", "TUS")], [OLD, NEW]);
  assert.ok(result.every((a) => a.status === "scheduled" && !a.scheduleChange));
});

test("nowa wersja nie ma tych zajęć → do weryfikacji, nie odwołanie", () => {
  const result = run([occ("old", "wilczki", "2026-11-05", "12:45"), occ("new", "wilczki", "2026-11-10", "09:00", "TUS")], [OLD, NEW]);
  const slowiki = result.find((a) => a.activity.startsWith("Słowiki"))!;
  assert.equal(slowiki.status, "scheduled");
  assert.equal(slowiki.verification, "needs_review");
});

test("niezmieniona strona tabeli z tego samego dnia nie daje „nowych terminów”", () => {
  const SAME_DAY = doc("page1", "2026-11-01T05:00:00Z");
  const result = run([occ("old", "wilczki", "2026-11-05", "12:45"), occ("page1", "wilczki", "2026-11-20", "12:45"), occ("new", "wilczki", "2026-11-06", "12:45")], [OLD, SAME_DAY, NEW]);
  assert.equal(result.find((a) => a.date === "2026-11-20")?.scheduleChange, undefined);
  assert.equal(result.find((a) => a.date === "2026-11-06")?.status, "rescheduled");
});

test("plik usunięty po zakończeniu miesiąca (bez nowszej wersji) → historia bez zmian", () => {
  const OCT = doc("oct", "2026-10-01T05:00:00Z", "2026-11-01T05:00:00Z");
  const result = run([occ("oct", "wilczki", "2026-10-15", "12:45"), occ("new", "wilczki", "2026-11-06", "12:45")], [OCT, NEW]);
  assert.ok(result.every((a) => a.status === "scheduled" && !a.scheduleChange));
});
