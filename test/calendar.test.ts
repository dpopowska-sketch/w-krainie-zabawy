// Testy „Dodaj do kalendarza” (web/src/calendar.ts) – czas polski, zmiana czasu, format .ics i link Google.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PublishedActivity } from "../src/published.js";
import { calendarEvent, googleCalendarUrl, icsFileName, icsText, shortTitle, warsawToUtc } from "../web/src/calendar.js";

function activity(partial: Partial<PublishedActivity>): PublishedActivity {
  return {
    id: "abc123",
    group: "wilczki",
    activity: "Słowiki - zajęcia oparte na nauce śpiewu oraz kształtowaniu poczucia rytmu",
    teacher: "J. Skoczowska",
    date: "2026-11-05",
    start: "12:45",
    end: "13:45",
    location: null,
    subgroup: null,
    status: "scheduled",
    previous: null,
    verification: "verified",
    reviewReasons: [],
    warnings: [],
    sources: [],
    updatedAt: "2026-11-01",
    ...partial,
  };
}

const PAGE = "https://example.org/";

test("czas polski → UTC przed i po zmianie czasu", () => {
  assert.equal(warsawToUtc("2026-10-20", "12:45").toISOString(), "2026-10-20T10:45:00.000Z");
  assert.equal(warsawToUtc("2026-10-27", "12:45").toISOString(), "2026-10-27T11:45:00.000Z");
});

test("tytuł skrócony, pełna nazwa w opisie", () => {
  assert.equal(shortTitle("Słowiki - zajęcia oparte na nauce śpiewu"), "Słowiki");
  assert.equal(shortTitle("Zajęcia sprawnościowo – zdrowotne"), "Zajęcia sprawnościowo");
  assert.equal(shortTitle("Zajęcia logopedyczne"), "Zajęcia logopedyczne");
  const e = calendarEvent(activity({}), "Wilczki", PAGE)!;
  assert.equal(e.title, "Słowiki (Wilczki)");
  assert.ok(e.description.includes("kształtowaniu poczucia rytmu"));
  assert.ok(e.description.includes(PAGE));
});

test("brak godziny końca → 60 minut; brak godziny początku → brak wydarzenia", () => {
  assert.equal(calendarEvent(activity({ end: null }), "Wilczki", PAGE)!.end, "13:45");
  assert.equal(calendarEvent(activity({ start: null }), "Wilczki", PAGE), null);
});

test("termin niepotwierdzony – ostrzeżenie w opisie", () => {
  const e = calendarEvent(activity({ verification: "needs_review" }), "Wilczki", PAGE)!;
  assert.ok(e.description.includes("niepotwierdzony"));
});

test("plik .ics: czasy w UTC, escapowanie, stały UID", () => {
  const e = calendarEvent(activity({ location: "Miki; sala 2, piętro" }), "Wilczki", PAGE)!;
  const ics = icsText(e, new Date("2026-11-04T10:00:00Z"));
  const unfolded = ics.replace(/\r\n /g, "");
  assert.ok(unfolded.includes("DTSTART:20261105T114500Z"));
  assert.ok(unfolded.includes("DTEND:20261105T124500Z"));
  assert.ok(unfolded.includes("UID:abc123@w-krainie-zabawy"));
  assert.ok(unfolded.includes("LOCATION:Słoneczne Przedszkole w Żernicy\\, Miki\\; sala 2\\, piętro"));
  assert.ok(unfolded.includes("\\nProwadzi: J. Skoczowska"));
  assert.ok(ics.split("\r\n").every((line) => line.length <= 61));
});

test("link Google: czas lokalny ze strefą", () => {
  const url = new URL(googleCalendarUrl(calendarEvent(activity({}), "Wilczki", PAGE)!));
  assert.equal(url.searchParams.get("dates"), "20261105T124500/20261105T134500");
  assert.equal(url.searchParams.get("ctz"), "Europe/Warsaw");
  assert.equal(url.searchParams.get("text"), "Słowiki (Wilczki)");
});

test("nazwa pliku bez polskich znaków", () => {
  assert.equal(icsFileName(calendarEvent(activity({}), "Wilczki", PAGE)!), "slowiki-wilczki-2026-11-05.ics");
});
