// Testy wydarzeń przedszkolnych – walidacja odczytu, decyzje i kalendarz. Bez AI.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDecisions } from "../src/build.js";
import { eventId, parseFileName, validateEvents } from "../src/events.js";
import type { ParsedEvent } from "../src/schema.js";
import { googleCalendarUrl, icsText, schoolCalendarEvent } from "../web/src/calendar.js";
import { daysBetween } from "../web/src/dates.js";

const META = { group: "wilczki", year: 2026, month: 11 };

function parsed(partial: Partial<ParsedEvent>): ParsedEvent {
  return { date: "2026-11-05", end_date: null, start: null, end: null, title: "Dzień Postaci z Bajek", details: null, uncertain: false, note: null, ...partial };
}

test("nazwa pliku: grupa i miesiąc", () => {
  assert.deepEqual(parseFileName("events/wilczki/2026-11.txt"), META);
  assert.equal(parseFileName("events/wilczki/listopad.txt"), null);
  assert.equal(parseFileName("events/wilczki/2026-13.txt"), null);
});

test("poprawne wydarzenie → zweryfikowane, opis bez myślnika na początku", () => {
  const [e] = validateEvents([parsed({ details: "– dzieci przychodzą przebrane." })], META, "events/wilczki/2026-11.txt");
  assert.equal(e!.verification, "verified");
  assert.equal(e!.details, "dzieci przychodzą przebrane.");
  assert.equal(e!.id, eventId("wilczki", "2026-11-05", "Dzień Postaci z Bajek"));
});

test("wątpliwości → do rozstrzygnięcia", () => {
  const cases: Partial<ParsedEvent>[] = [
    { uncertain: true, note: "w przyszłym tygodniu" },
    { date: "2026-11-31" },
    { date: "5.11" },
    { date: "2027-03-01" },
    { end_date: "2026-11-01" },
    { end_date: "2026-12-30" },
  ];
  for (const c of cases) {
    const [e] = validateEvents([parsed(c)], META, "f");
    assert.equal(e!.verification, "needs_review", JSON.stringify(c));
  }
  // Sąsiedni miesiąc jest dopuszczalny (np. 1.12 w wiadomości listopadowej).
  assert.equal(validateEvents([parsed({ date: "2026-12-01" })], META, "f")[0]!.verification, "verified");
});

test("decyzje: confirm publikuje, edit poprawia, hide usuwa", () => {
  const events = validateEvents(
    [parsed({ title: "A", uncertain: true, note: "?" }), parsed({ title: "B", uncertain: true, note: "?" }), parsed({ title: "C" })],
    META,
    "f",
  );
  const [a, b, c] = events.map((e) => e.id);
  const problems = applyDecisions(
    new Map(),
    [],
    events,
    [
      { event: a!, action: "confirm" },
      { event: b!, action: "edit", set: { date: "2026-11-12", title: "B poprawione" } },
      { event: c!, action: "hide" },
      { event: "nieistnieje", action: "confirm" },
    ],
  );
  assert.equal(events.length, 2);
  assert.ok(events.every((e) => e.verification === "verified"));
  assert.equal(events[1]!.date, "2026-11-12");
  assert.equal(events[1]!.title, "B poprawione");
  assert.equal(problems.length, 1);
});

test("wielodniowe wydarzenie – każdy dzień zakresu", () => {
  assert.deepEqual(daysBetween("2026-11-28", "2026-12-02"), ["2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  assert.deepEqual(daysBetween("2026-11-05", "2026-11-05"), ["2026-11-05"]);
});

test("kalendarz: wydarzenie całodniowe i z godziną", () => {
  const [allDay, timed] = validateEvents(
    [parsed({ date: "2026-12-14", end_date: "2026-12-18", title: "Warsztaty" }), parsed({ date: "2026-11-18", start: "16:30", title: "Zebranie" })],
    { ...META, month: 12 },
    "f",
  );
  const e1 = schoolCalendarEvent(allDay!, "Wilczki", "https://example.org/");
  const ics = icsText(e1, new Date("2026-11-04T10:00:00Z")).replace(/\r\n /g, "");
  assert.ok(ics.includes("DTSTART;VALUE=DATE:20261214"));
  assert.ok(ics.includes("DTEND;VALUE=DATE:20261219"));
  assert.equal(new URL(googleCalendarUrl(e1)).searchParams.get("dates"), "20261214/20261219");

  const e2 = schoolCalendarEvent(timed!, "Wilczki", "https://example.org/");
  assert.ok(icsText(e2).replace(/\r\n /g, "").includes("DTSTART:20261118T153000Z"));
  assert.equal(e2.end, "17:30");
});
