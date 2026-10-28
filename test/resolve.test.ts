// Testy dopasowania ogłoszeń do harmonogramu – bez AI, na odczytanym harmonogramie z października.
import assert from "node:assert/strict";
import { test } from "node:test";
import { loadGroups } from "../src/config.js";
import { resolveChange, resolveGroupRef } from "../src/resolve.js";
import { loadConsensus } from "../src/schedule.js";
import type { AnnouncedChange } from "../src/schema.js";

const config = loadGroups();
const { occurrences } = loadConsensus();

function change(partial: Partial<AnnouncedChange>): AnnouncedChange {
  return {
    type: "cancelled",
    dates: [],
    activity_ref: null,
    group_refs: [],
    new_date: null,
    new_start: null,
    new_end: null,
    uncertain: false,
    note: null,
    ...partial,
  };
}

test("grupy: nazwa, odmiana, miejsce, nieznana", () => {
  assert.deepEqual(resolveGroupRef("Sówki", config), ["sowki"]);
  assert.deepEqual(resolveGroupRef("Sówek", config), ["sowki"]);
  assert.deepEqual(resolveGroupRef("grupa Miki", config), ["motylki", "wilczki"]);
  assert.equal(resolveGroupRef("Rybki", config), null);
});

test("nieznana grupa → weryfikacja", () => {
  const r = resolveChange(change({ dates: ["2026-10-15"], activity_ref: "Słowiki", group_refs: ["Rybki"] }), occurrences, config);
  assert.equal(r.status, "needs_review");
});

test("niejednoznaczna nazwa zajęć → weryfikacja z kandydatami", () => {
  const r = resolveChange(change({ dates: ["2026-10-07"], activity_ref: "kompetencje" }), occurrences, config);
  assert.equal(r.status, "needs_review");
  assert.ok(r.status === "needs_review" && (r.candidates?.length ?? 0) > 1);
});

test("odwołanie w dniu bez zajęć → weryfikacja, nic nie jest zmieniane", () => {
  const r = resolveChange(change({ dates: ["2026-10-16"], activity_ref: "Słowiki" }), occurrences, config);
  assert.equal(r.status, "needs_review");
});

test("jedna z dat bez terminu → weryfikacja całej zmiany", () => {
  const r = resolveChange(change({ dates: ["2026-10-15", "2026-10-16"], activity_ref: "Słowiki" }), occurrences, config);
  assert.equal(r.status, "needs_review");
});

test("ogłoszenie oznaczone jako niejednoznaczne → weryfikacja", () => {
  const r = resolveChange(change({ dates: ["2026-10-15"], activity_ref: "Słowiki", uncertain: true, note: "?" }), occurrences, config);
  assert.equal(r.status, "needs_review");
});

test("przeniesienie zajęć na inny dzień", () => {
  const r = resolveChange(
    change({ type: "rescheduled", dates: ["2026-10-15"], activity_ref: "Słowiki", group_refs: ["Sówki"], new_date: "2026-10-16" }),
    occurrences,
    config,
  );
  assert.equal(r.status, "applied");
  assert.ok(r.status === "applied");
  assert.equal(r.effects.length, 1);
  const e = r.effects[0]!;
  assert.ok(e.kind === "reschedule");
  assert.equal(e.target.group, "sowki");
  assert.equal(e.date, "2026-10-16");
  assert.equal(e.start, "12:45");
});

test("zmiana dotyczy tylko wskazanej grupy", () => {
  const r = resolveChange(change({ dates: ["2026-10-15"], activity_ref: "Słowiki", group_refs: ["Żabki"] }), occurrences, config);
  assert.ok(r.status === "applied");
  assert.deepEqual(r.effects.map((e) => (e.kind === "add" ? e.group : e.target.group)), ["zabki"]);
});
