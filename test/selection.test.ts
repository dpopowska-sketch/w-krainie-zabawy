// Testy „Moich zajęć” (web/src/selection.ts) na opublikowanym harmonogramie Wilczków.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readJson } from "../src/config.js";
import type { PublishedActivity, PublishedSchedule } from "../src/published.js";
import { activityKey, activityTypes, isSelected, sameKind, selectionFromCodes, shortCode, unseenTypes } from "../web/src/selection.js";

const schedule = readJson<PublishedSchedule>("data/published/schedule.json");
const wilczki = schedule.activities.filter((a) => a.group === "wilczki");
const types = activityTypes(wilczki);
const find = (fragment: string) => types.find((t) => t.name.toLowerCase().includes(fragment))!;

test("rodzaje zajęć: każdy rodzaj raz, z liczbą terminów", () => {
  const keys = types.map((t) => t.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(types.reduce((n, t) => n + t.count, 0), wilczki.length);
  assert.ok(find("słowiki").count >= 2);
});

test("ta sama nazwa mimo drobnych różnic między miesiącami", () => {
  assert.ok(sameKind(activityKey("Zajęcia Przedszkolak Mały projektant i technolog"), activityKey("Przedszkolak Mały Projektant")));
  assert.ok(sameKind(activityKey("Zajęcia sprawnościowo – zdrowotne"), activityKey("Zajęcia sprawnościowo-zdrowotne")));
  assert.ok(!sameKind(activityKey("Zajęcia logopedyczne"), activityKey("Zajęcia korekcyjno-kompensacyjne")));
});

test("filtr: tylko wybrane rodzaje, łącznie z odwołanymi terminami", () => {
  const selection = { selected: [find("projektant").key], known: types.map((t) => t.key) };
  const shown = wilczki.filter((a) => isSelected(selection, a));
  assert.ok(shown.length > 0);
  assert.ok(shown.every((a) => a.activity.includes("projektant")));
  assert.ok(shown.some((a) => a.status === "cancelled"), "odwołany termin 27.10 zostaje widoczny");
});

test("nowe zajęcia są wykrywane", () => {
  const selection = { selected: [find("słowiki").key], known: [find("słowiki").key] };
  const extra: PublishedActivity = { ...wilczki[0]!, id: "x", activity: "Zajęcia z robotyki dla zaawansowanych" };
  const unseen = unseenTypes(selection, activityTypes([...wilczki, extra]));
  assert.ok(unseen.some((t) => t.name.includes("zaawansowanych")));
  assert.equal(unseenTypes({ selected: [], known: types.map((t) => t.key) }, types).length, 0);
});

test("link: kody odtwarzają ten sam wybór", () => {
  const chosen = [find("słowiki").key, find("tus").key];
  const codes = chosen.map(shortCode).join(".");
  const restored = selectionFromCodes(codes, types);
  assert.deepEqual(restored?.selected.sort(), [...chosen].sort());
  assert.equal(selectionFromCodes("zzzzzz", types), null);
});
