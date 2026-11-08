// Testy „Kalendarz w telefonie” (web/src/feed.ts, calendarView w src/build.ts) – warianty, odwołane, zakres roku szkolnego.
import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarView, schoolYearStart } from "../src/build.js";
import type { CalendarData, PublishedActivity, SchoolEvent } from "../src/published.js";
import { feedText, feedUrl, selectionCodes } from "../web/src/feed.js";
import { activityKey } from "../web/src/selection.js";

function activity(partial: Partial<PublishedActivity>): PublishedActivity {
  return {
    id: "a1",
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

function event(partial: Partial<SchoolEvent>): SchoolEvent {
  return {
    id: "e1",
    group: "wilczki",
    date: "2026-11-09",
    endDate: null,
    start: null,
    end: null,
    title: "Wyjście do biblioteki",
    details: null,
    verification: "verified",
    reviewReasons: [],
    source: "events/wilczki/2026-11.txt",
    ...partial,
  };
}

const DATA: CalendarData = {
  groups: [{ id: "wilczki", name: "Wilczki" }],
  activities: [
    activity({}),
    activity({ id: "a2", activity: "Zajęcia Mali Artyści - rozwijanie kompetencji", date: "2026-11-09", start: "14:15", end: "15:15" }),
    activity({ id: "a3", date: "2026-11-12", status: "cancelled" }),
  ],
  events: [event({})],
};

const NOW = new Date("2026-11-08T10:00:00Z");
const unfold = (ics: string) => ics.replace(/\r\n /g, "");
const uids = (ics: string) => [...unfold(ics).matchAll(/UID:(\S+)/g)].map((m) => m[1]);

test("wszystkie zajęcia: zajęcia, odwołane i wydarzenia grupy, nazwa kalendarza", () => {
  const ics = unfold(feedText(DATA, { group: "wilczki", codes: null, now: NOW })!);
  assert.deepEqual(uids(ics), ["a1@w-krainie-zabawy", "a2@w-krainie-zabawy", "a3@w-krainie-zabawy", "e1@w-krainie-zabawy"]);
  assert.ok(ics.includes("X-WR-CALNAME:Wilczki – wszystkie zajęcia"));
  assert.ok(ics.includes("REFRESH-INTERVAL;VALUE=DURATION:PT1H"));
});

test("odwołane: dopisek w tytule i STATUS:CANCELLED", () => {
  const ics = unfold(feedText(DATA, { group: "wilczki", codes: null, now: NOW })!);
  const cancelled = ics.split("BEGIN:VEVENT").find((v) => v.includes("UID:a3@"))!;
  assert.ok(cancelled.includes("SUMMARY:ODWOŁANE: Słowiki (Wilczki)"));
  assert.ok(cancelled.includes("STATUS:CANCELLED"));
  assert.ok(!ics.split("BEGIN:VEVENT").find((v) => v.includes("UID:a1@"))!.includes("STATUS:"));
});

test("moje zajęcia: tylko wybrane rodzaje, wydarzenia grupy zawsze", () => {
  const codes = selectionCodes([activityKey("Zajęcia Mali Artyści - rozwijanie kompetencji")]);
  const ics = feedText(DATA, { group: "wilczki", codes, now: NOW })!;
  assert.deepEqual(uids(ics), ["a2@w-krainie-zabawy", "e1@w-krainie-zabawy"]);
  assert.ok(unfold(ics).includes("X-WR-CALNAME:Wilczki – moje zajęcia"));
});

test("moje zajęcia: ta sama nazwa z drobną różnicą w innym miesiącu też pasuje", () => {
  const data: CalendarData = {
    ...DATA,
    activities: [
      activity({ id: "p1", activity: "Mały projektant i technolog", date: "2026-10-07" }),
      activity({ id: "p2", activity: "Mały Projektant i technolog - konstruowanie", date: "2026-11-04" }),
    ],
  };
  const ics = feedText(data, { group: "wilczki", codes: selectionCodes([activityKey("Mały projektant i technolog")]), now: NOW })!;
  assert.deepEqual(uids(ics), ["p1@w-krainie-zabawy", "p2@w-krainie-zabawy", "e1@w-krainie-zabawy"]);
});

test("nieznana grupa → brak kalendarza; link z kodami", () => {
  assert.equal(feedText(DATA, { group: "sowki", codes: null }), null);
  assert.equal(feedUrl("wilczki", null), "https://wilczki-kalendarz.pages.dev/kalendarz/wilczki.ics");
  assert.equal(feedUrl("wilczki", ["b", "a"]), "https://wilczki-kalendarz.pages.dev/kalendarz/wilczki.ics?moje=b.a");
});

test("rok szkolny zaczyna się 1 września", () => {
  assert.equal(schoolYearStart("2026-11"), "2026-09-01");
  assert.equal(schoolYearStart("2026-09"), "2026-09-01");
  assert.equal(schoolYearStart("2027-03"), "2026-09-01");
});

test("calendarView: bieżący rok szkolny, tylko grupy publiczne i potwierdzone wydarzenia", () => {
  const view = calendarView(
    {
      sourcePage: "https://example.org/",
      groups: [
        { id: "wilczki", name: "Wilczki" },
        { id: "sowki", name: "Sówki" },
      ],
      activities: [
        activity({ id: "old", date: "2026-06-10" }),
        activity({ id: "oct", date: "2026-10-01", warnings: ["x"] }),
        activity({ id: "other", group: "sowki" }),
      ],
      notices: [],
      events: [event({}), event({ id: "e2", verification: "needs_review" })],
    },
    ["wilczki"],
    "2026-11",
  );
  assert.deepEqual(view.groups.map((g) => g.id), ["wilczki"]);
  assert.deepEqual(view.activities.map((a) => a.id), ["oct"]);
  assert.deepEqual(view.activities[0]!.warnings, []);
  assert.deepEqual(view.events.map((e) => e.id), ["e1"]);
});
