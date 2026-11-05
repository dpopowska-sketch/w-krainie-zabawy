// Testy jadłospisu – bez sieci i bez AI (odczyt modelu jest symulowany z danych wzorcowych).
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import {
  buildWeek,
  comparable,
  findMenuLinks,
  firstDifference,
  isPolishHoliday,
  normalizeAmount,
  normalizeName,
  shouldCheck,
  weekRange,
} from "../src/menu.js";
import type { MealKey, MenuWeek } from "../src/published.js";
import type { MenuExtraction } from "../src/schema.js";

const golden = JSON.parse(fs.readFileSync("test/golden/jadlospis-2026-11-02.json", "utf8")) as MenuWeek;
const SOURCE = { url: golden.sourceUrl, sha256: "abc" };

/** Odczyt „jak z modelu”: gramatury w zapisie z PDF (bez spacji, z kropką), nazwy małą literą tam, gdzie w PDF. */
function extractionFromGolden(): MenuExtraction {
  const raw = (amount: string | null) => (amount === null ? null : amount.replace(" szt.", "szt").replace(" ", "") + ".");
  return {
    is_menu: true,
    title: golden.title,
    days: golden.days.map((d) => {
      const meal = (k: MealKey) => ({
        items: d.meals[k].items.map((i) => ({ raw: `${i.name} ${i.amount ?? ""}`, name: i.name, amount: raw(i.amount), allergens: i.allergens })),
        notes: d.meals[k].notes.map((n) => `(${n})`),
        allergens_unassigned: d.meals[k].allergensUnassigned,
      });
      return { weekday: d.weekday, closed_text: null, sniadanie: meal("sniadanie"), obiad: meal("obiad"), podwieczorek: meal("podwieczorek") };
    }),
    document_notes: golden.documentNotes,
    uncertain: false,
    note: null,
  };
}

test("gramatury: zapis z PDF → znormalizowany", () => {
  assert.equal(normalizeAmount("50g.(1)".replace("(1)", "")), "50 g");
  assert.equal(normalizeAmount("150ml."), "150 ml");
  assert.equal(normalizeAmount("czerwona50g.".slice(8)), "50 g");
  assert.equal(normalizeAmount("100/120g"), "100/120 g");
  assert.equal(normalizeAmount("120g/180g."), "120/180 g");
  assert.equal(normalizeAmount("1szt"), "1 szt.");
  assert.equal(normalizeAmount("50g,"), "50 g");
  assert.equal(normalizeAmount(null), null);
  assert.equal(normalizeAmount("  "), null);
  assert.equal(normalizeAmount("garść"), "garść", "nieznany zapis zostaje bez zmian");
});

test("nazwy: spacje, kropki, wielka litera", () => {
  assert.equal(normalizeName("Pieczywo mieszane , razowe"), "Pieczywo mieszane, razowe");
  assert.equal(normalizeName("Herbata z miodem i\ncytryną."), "Herbata z miodem i cytryną");
  assert.equal(normalizeName("sałata zielona"), "Sałata zielona");
  assert.equal(normalizeName("Woda. "), "Woda");
  assert.equal(normalizeName("Muffiny bananowe (wyrób własny)"), "Muffiny bananowe (wyrób własny)");
});

test("tydzień z nagłówka i roku z nazwy pliku", () => {
  assert.deepEqual(weekRange("JADŁOSPIS 02.11–06.11", golden.sourceUrl), { weekStart: "2026-11-02", weekEnd: "2026-11-06" });
  // Bez nagłówka – z nazwy pliku.
  assert.deepEqual(weekRange("JADŁOSPIS", golden.sourceUrl), { weekStart: "2026-11-02", weekEnd: "2026-11-06" });
  // Przełom roku.
  assert.deepEqual(weekRange("JADŁOSPIS 28.12–01.01", "https://zspzernica.pilchowice.pl/wp-content/uploads/2026/12/Jadlospis.pdf"), {
    weekStart: "2026-12-28",
    weekEnd: "2027-01-01",
  });
  // 03.11 to wtorek – to nie jest tydzień pon–pt.
  assert.equal(weekRange("JADŁOSPIS 03.11–07.11", golden.sourceUrl), null);
});

test("święta ustawowe", () => {
  assert.ok(isPolishHoliday("2026-11-11"));
  assert.ok(isPolishHoliday("2026-04-06"), "Poniedziałek Wielkanocny 2026");
  assert.ok(isPolishHoliday("2026-06-04"), "Boże Ciało 2026");
  assert.ok(isPolishHoliday("2026-12-24"));
  assert.ok(!isPolishHoliday("2026-11-05"));
});

test("harmonogram sprawdzeń (czas polski)", () => {
  // 5.11.2026 (czwartek), zima: UTC+1.
  const at = (utc: string) => new Date(`2026-11-05T${utc}:00Z`);
  assert.equal(shouldCheck(at("08:30"), null, false).run, true, "9:30 – pierwsze w oknie 9:00");
  assert.equal(shouldCheck(at("09:10"), "2026-11-05T08:30:00Z", false).run, false, "10:10 – okno 9:00 już sprawdzone");
  assert.equal(shouldCheck(at("10:10"), "2026-11-05T08:30:00Z", false).run, true, "11:10 – nowe okno");
  assert.equal(shouldCheck(at("10:10"), "2026-11-05T08:30:00Z", true).run, false, "jest jadłospis – tylko 9:00 i 15:00");
  assert.equal(shouldCheck(at("14:20"), "2026-11-05T08:30:00Z", true).run, true, "15:20 – sprawdzenie korekt");
  assert.equal(shouldCheck(at("06:00"), null, false).run, false, "7:00 – za wcześnie");
  assert.equal(shouldCheck(at("20:30"), null, false).run, false, "21:30 – za późno");
  assert.equal(shouldCheck(new Date("2026-11-07T09:00:00Z"), null, false).run, false, "sobota");
  assert.equal(shouldCheck(new Date("2026-11-11T09:00:00Z"), null, false).run, false, "11 listopada");
});

test("odczyt zgodny z wzorcem daje plik tygodnia równy wzorcowi", () => {
  const { week, problems } = buildWeek(extractionFromGolden(), SOURCE, "2026-11-05T08:00:00Z");
  assert.deepEqual(problems, []);
  assert.equal(firstDifference(comparable(week!), comparable(golden)), null);
  assert.equal(week!.sourceFile, golden.sourceFile);
  // Brak oznaczenia zostaje brakiem – nic nie jest dopisywane.
  assert.deepEqual(week!.days[1]!.meals.sniadanie.items[1], { name: "Masło", amount: "8 g", allergens: [], raw: "Masło 8 g" });
});

test("walidacja: wątpliwości i błędy blokują publikację", () => {
  const bad = extractionFromGolden();
  bad.days[2]!.obiad.items[0]!.allergens = [15];
  bad.days[3]!.podwieczorek.items = [];
  bad.uncertain = true;
  bad.note = "nieczytelna komórka";
  const { problems } = buildWeek(bad, SOURCE, "2026-11-05T08:00:00Z");
  assert.ok(problems.some((p) => p.includes("spoza 1–14: 15")));
  assert.ok(problems.some((p) => p.includes("2026-11-05: brak posiłku „podwieczorek”")));
  assert.ok(problems.some((p) => p.includes("nieczytelna komórka")));

  const missing = extractionFromGolden();
  missing.days.splice(4, 1);
  assert.ok(buildWeek(missing, SOURCE, "x").problems.some((p) => p.includes("Brak dnia piątek")));

  const wrongWeek = extractionFromGolden();
  wrongWeek.title = "JADŁOSPIS 03.11–07.11";
  assert.equal(buildWeek(wrongWeek, { ...SOURCE, url: "https://zspzernica.pilchowice.pl/wp-content/uploads/2026/11/j.pdf" }, "x").week, null);
});

test("dzień wolny i święto", () => {
  const ex = extractionFromGolden();
  ex.days[0] = { ...ex.days[0]!, closed_text: "Dzień wolny od zajęć", sniadanie: { items: [], notes: [], allergens_unassigned: [] } };
  const { week, problems } = buildWeek(ex, SOURCE, "x");
  assert.deepEqual(problems, []);
  assert.equal(week!.days[0]!.closed, true);
  assert.equal(week!.days[0]!.closedText, "Dzień wolny od zajęć");
});

test("różnica między odczytami jest wskazana", () => {
  const a = buildWeek(extractionFromGolden(), SOURCE, "x").week!;
  const ex = extractionFromGolden();
  ex.days[0]!.obiad.items[1]!.allergens = [1, 6];
  const b = buildWeek(ex, SOURCE, "x").week!;
  assert.match(firstDifference(comparable(a), comparable(b))!, /days\/0\/meals\/obiad\/items\/1\/allergens/);
});

test("linki ze strony stołówki – po tekście linku", () => {
  const html = `
    <a href="https://zspzernica.pilchowice.pl/wp-content/uploads/2026/06/druk.pdf">druk-zwrot za posiłki</a>
    <a href="https://zspzernica.pilchowice.pl/wp-content/uploads/2026/11/Jadlospis-02_11_06_11-26r.pdf" class="stm-btn-download">
      <span class="stm-btn-download__body"><span class="stm-btn-download__text">Jadłospis   na bieżący
      tydzień</span></span></a>
    <a href="/wp-content/uploads/2025/06/Substancje.pdf"><span>Substancje lub produkty powodujące alergie lub reakcje nietolerancji</span></a>`;
  assert.deepEqual(findMenuLinks(html, "https://zspzernica.pilchowice.pl/stolowka/"), {
    menuUrl: "https://zspzernica.pilchowice.pl/wp-content/uploads/2026/11/Jadlospis-02_11_06_11-26r.pdf",
    allergenDocUrl: "https://zspzernica.pilchowice.pl/wp-content/uploads/2025/06/Substancje.pdf",
  });
  assert.deepEqual(findMenuLinks("<p>brak</p>", "https://zspzernica.pilchowice.pl/stolowka/"), { menuUrl: null, allergenDocUrl: null });
});
