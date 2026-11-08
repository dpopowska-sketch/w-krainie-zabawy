// Moduł „Co dziś dobrego?” – jadłospis stołówki szkoły z oznaczeniami alergenów.
// Dane: data/menu/index.json, status.json i jeden plik na tydzień (wczytywany, gdy rodzic go otworzy).
// „Dziś” zawsze w czasie polskim. Alergeny pokazujemy dokładnie tak, jak podała szkoła – bez domysłów.
import { useEffect, useState } from "preact/hooks";
import type { MealKey, MenuDay, MenuIndex, MenuMeal, MenuStatus, MenuWeek } from "../../src/published";
import { addDays, formatCheck, formatDayWithYear, formatTimestamp, mondayOf, todayIso, weekdayIndex } from "./dates";
import { ChevronIcon, WarnIcon } from "./kinds";

/** Słownik 14 alergenów (numeracja z dokumentu szkoły): krótka nazwa na etykiecie, pełna w słowniku. */
export const ALLERGENS: Record<number, { short: string; full: string }> = {
  1: { short: "Gluten", full: "Zboża zawierające gluten" },
  2: { short: "Skorupiaki", full: "Skorupiaki" },
  3: { short: "Jaja", full: "Jaja" },
  4: { short: "Ryby", full: "Ryby" },
  5: { short: "Orzeszki ziemne", full: "Orzeszki ziemne" },
  6: { short: "Soja", full: "Soja" },
  7: { short: "Mleko", full: "Mleko i produkty pochodne" },
  8: { short: "Orzechy", full: "Orzechy" },
  9: { short: "Seler", full: "Seler" },
  10: { short: "Gorczyca", full: "Gorczyca" },
  11: { short: "Sezam", full: "Sezam" },
  12: { short: "Siarczyny", full: "Dwutlenek siarki i siarczyny" },
  13: { short: "Łubin", full: "Łubin" },
  14: { short: "Mięczaki", full: "Mięczaki" },
};

const MEALS: { key: MealKey; title: string }[] = [
  { key: "sniadanie", title: "Śniadanie" },
  { key: "obiad", title: "Obiad" },
  { key: "podwieczorek", title: "Podwieczorek" },
];

/** Harmonogram sprawdzeń strony stołówki – jak w src/menu.ts (shouldCheck) i .github/workflows/menu.yml. */
export const MENU_CHECK_SCHEDULE = [
  "W dni robocze (bez świąt) o 9:00, 11:00, 13:00, 15:00, 17:00 i 19:00.",
  "Gdy jadłospis na bieżący tydzień już jest – o 9:00 i 15:00 (korekty).",
];

const WEEKDAY_SHORT = ["Pn", "Wt", "Śr", "Cz", "Pt"];
const MENU_PAGE_FALLBACK = "https://zspzernica.pilchowice.pl/stolowka/";
/** Jadłospis sprawdzamy tylko w dni robocze – po weekendzie z długim piątkiem to nadal nie jest „stare”. */
const MENU_STALE_AFTER_HOURS = 96;

export interface MenuData {
  index: MenuIndex | null;
  status: MenuStatus | null;
  error: boolean;
  /** Wczytane tygodnie: poniedziałek → dane albo "error". */
  weeks: Record<string, MenuWeek | "error">;
  loadWeek: (weekStart: string) => void;
}

async function loadJson<T>(file: string): Promise<T> {
  const res = await fetch(`./data/menu/${file}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Dane jadłospisu wczytywane dopiero przy pierwszym otwarciu modułu. */
export function useMenuData(active: boolean): MenuData {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState<MenuIndex | null>(null);
  const [status, setStatus] = useState<MenuStatus | null>(null);
  const [error, setError] = useState(false);
  const [weeks, setWeeks] = useState<Record<string, MenuWeek | "error">>({});

  useEffect(() => {
    if (!active || started) return;
    setStarted(true);
    loadJson<MenuIndex>("index.json")
      .then(setIndex)
      .catch(() => setError(true));
    loadJson<MenuStatus>("status.json")
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [active]);

  const loadWeek = (weekStart: string) => {
    if (weeks[weekStart]) return;
    const entry = index?.weeks.find((w) => w.weekStart === weekStart);
    if (!entry) return;
    loadJson<MenuWeek>(entry.file)
      .then((week) => setWeeks((all) => ({ ...all, [weekStart]: week })))
      .catch(() => setWeeks((all) => ({ ...all, [weekStart]: "error" })));
  };

  return { index, status, error, weeks, loadWeek };
}

export function isMenuStale(status: MenuStatus | null): boolean {
  if (!status?.lastChecked) return false;
  const hours = status.lastSuccess ? (Date.now() - Date.parse(status.lastSuccess)) / 36e5 : Infinity;
  return status.errors.length > 0 || hours >= MENU_STALE_AFTER_HOURS;
}

/** Wszystkie numery alergenów dnia, rosnąco (z pozycji i z oznaczeń całego posiłku). */
function dayAllergens(day: MenuDay): number[] {
  const all = MEALS.flatMap(({ key }) => [...day.meals[key].items.flatMap((i) => i.allergens), ...day.meals[key].allergensUnassigned]);
  return [...new Set(all)].sort((a, b) => a - b);
}

/** Główne danie obiadu do paska tygodnia: pierwsza pozycja z gramaturą, która nie jest w ml (nie zupa ani napój). */
function mainDish(day: MenuDay | undefined): string | null {
  if (!day || day.closed) return null;
  return day.meals.obiad.items.find((i) => i.amount !== null && !/ml$/.test(i.amount))?.name ?? null;
}

/** „02.11–06.11” */
function shortRange(week: MenuWeek): string {
  const fmt = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
  return `${fmt(week.weekStart)}–${fmt(week.weekEnd)}`;
}

export function MenuPage(props: { data: MenuData; date: string; onDate: (date: string) => void }) {
  const { data, date, onDate } = props;
  const today = todayIso();
  const monday = mondayOf(date);
  const weekend = weekdayIndex(date) >= 5;
  const entry = data.index?.weeks.find((w) => w.weekStart === monday);
  const loaded = entry ? data.weeks[entry.weekStart] : undefined;
  const week = loaded && loaded !== "error" ? loaded : null;
  const day = week?.days.find((d) => d.date === date);

  useEffect(() => {
    if (entry) data.loadWeek(entry.weekStart);
  }, [entry?.weekStart]);

  const shiftWeek = (delta: number) => onDate(addDays(weekend ? monday : date, delta));
  const label = date === today ? "Dziś" : weekend ? "Weekend" : null;
  const allergensOfDay = day && !day.closed ? dayAllergens(day) : [];

  let content;
  if (data.error || loaded === "error") {
    content = (
      <div class="alert alert-error" role="alert">
        <WarnIcon />
        <div>Nie udało się wczytać jadłospisu. Sprawdź połączenie z internetem i odśwież stronę.</div>
      </div>
    );
  } else if (!data.index) {
    content = <p class="message">Wczytywanie…</p>;
  } else if (weekend) {
    content = (
      <section class="panel menu-empty">
        <h2>W weekend nie ma zaplanowanych posiłków</h2>
        <button type="button" class="link-btn menu-empty-link" onClick={() => onDate(addDays(monday, 7))}>
          Zobacz jadłospis na poniedziałek →
        </button>
      </section>
    );
  } else if (entry && loaded === undefined) {
    content = <p class="message">Wczytywanie…</p>;
  } else if (day?.closed) {
    content = (
      <section class="panel menu-empty">
        <h2>{day.closedText ?? "Tego dnia nie ma posiłków."}</h2>
      </section>
    );
  } else if (day) {
    content = <DayMenu day={day} allergens={allergensOfDay} isToday={date === today} />;
  } else if (!entry && monday === mondayOf(today)) {
    const previous = data.index.weeks.filter((w) => w.weekStart < monday).at(-1);
    content = (
      <section class="panel menu-empty">
        <h2>Jadłospis na ten tydzień nie został jeszcze opublikowany.</h2>
        <p class="muted">
          Szkoła zwykle publikuje go w poniedziałek. Sprawdzamy stronę stołówki kilka razy w ciągu dnia.
          {data.status?.lastChecked && ` Ostatnie sprawdzenie: ${formatCheck(data.status.lastChecked)}.`}
        </p>
        {previous && (
          <button type="button" class="link-btn menu-empty-link" onClick={() => onDate(previous.weekStart)}>
            ← Jadłospis z poprzedniego tygodnia
          </button>
        )}
      </section>
    );
  } else {
    content = (
      <section class="panel menu-empty">
        <h2>Brak jadłospisu na wybrany dzień.</h2>
      </section>
    );
  }

  return (
    <>
      {isMenuStale(data.status) && (
        <div class="alert alert-warn" role="status">
          <span class="alert-icon">
            <WarnIcon />
          </span>
          <div class="alert-body">
            <strong>Nie udało się sprawdzić aktualności</strong>
            <span>
              {data.status?.lastSuccess ? `Ostatnio udało się sprawdzić stronę stołówki ${formatCheck(data.status.lastSuccess)}. ` : ""}
              Pokazujemy ostatni zapisany jadłospis.
            </span>
          </div>
        </div>
      )}

      <section class="panel menu-head" aria-label="Wybór dnia">
        <div class="menu-day-row">
          <div class="menu-day-title">
            {label && <span class={`menu-label${label === "Dziś" ? " menu-label-today" : ""}`}>{label}</span>}
            <h1>{formatDayWithYear(date)}</h1>
          </div>
          <div class="menu-day-nav">
            <button type="button" class="menu-nav-btn" aria-label="Poprzedni dzień" onClick={() => onDate(addDays(date, -1))}>
              <ChevronIcon dir="left" />
            </button>
            <button type="button" class="btn menu-today" disabled={date === today} onClick={() => onDate(today)}>
              Dzisiaj
            </button>
            <button type="button" class="menu-nav-btn" aria-label="Następny dzień" onClick={() => onDate(addDays(date, 1))}>
              <ChevronIcon dir="right" />
            </button>
          </div>
        </div>

        <div class="menu-week">
          <button type="button" class="menu-nav-btn menu-week-arrow" aria-label="Poprzedni tydzień" onClick={() => shiftWeek(-7)}>
            <ChevronIcon dir="left" />
          </button>
          <div class="menu-week-days" role="group" aria-label={`Tydzień od ${formatDayWithYear(monday)}`}>
            {WEEKDAY_SHORT.map((name, i) => {
              const d = addDays(monday, i);
              const menuDay = week?.days.find((x) => x.date === d);
              const dish = mainDish(menuDay);
              return (
                <button
                  type="button"
                  class={`menu-wd${menuDay && !menuDay.closed ? "" : " menu-wd-empty"}${d === today ? " menu-wd-today" : ""}`}
                  aria-pressed={d === date}
                  aria-label={formatDayWithYear(d)}
                  onClick={() => onDate(d)}
                >
                  <span class="menu-wd-name">{name}</span>
                  <span class="menu-wd-num">{Number(d.slice(8))}</span>
                  {dish && <span class="menu-wd-dish">{dish}</span>}
                </button>
              );
            })}
          </div>
          <button type="button" class="menu-nav-btn menu-week-arrow" aria-label="Następny tydzień" onClick={() => shiftWeek(7)}>
            <ChevronIcon dir="right" />
          </button>
        </div>
      </section>

      {content}

      {data.index && <MenuInfo status={data.status} week={week} highlighted={allergensOfDay} />}
    </>
  );
}

function AllergenChip({ n }: { n: number }) {
  const a = ALLERGENS[n];
  return (
    <span class="al-chip" title={a ? `${n} – ${a.full}` : `Alergen nr ${n}`}>
      <span class="al-num">{n}</span>
      {a?.short ?? "?"}
    </span>
  );
}

function DayMenu({ day, allergens, isToday }: { day: MenuDay; allergens: number[]; isToday: boolean }) {
  return (
    <>
      <div class="menu-allergens-bar">
        <span class="menu-allergens-label">{isToday ? "Alergeny dziś:" : "Alergeny w tym dniu:"}</span>
        {allergens.length ? allergens.map((n) => <AllergenChip n={n} />) : <span class="muted">brak oznaczeń w jadłospisie</span>}
        <a href="#alergeny" class="menu-allergens-link">
          Co oznaczają numery?
        </a>
      </div>

      <div class="menu-meals">
        {MEALS.map(({ key, title }) => (
          <MealCard meal={day.meals[key]} mealKey={key} title={title} />
        ))}
      </div>

      <p class="menu-disclaimer">Brak oznaczenia alergenu przy potrawie nie oznacza, że jej nie zawiera.</p>
    </>
  );
}

function MealCard({ meal, mealKey, title }: { meal: MenuMeal; mealKey: MealKey; title: string }) {
  return (
    <section class={`panel meal meal-${mealKey}`} aria-label={title}>
      <div class="meal-head">
        <span class="meal-tile">
          <MealIcon meal={mealKey} />
        </span>
        <h2>{title}</h2>
      </div>
      {meal.items.length === 0 ? (
        <p class="muted meal-none">Brak pozycji w jadłospisie.</p>
      ) : (
        <ul class="meal-items">
          {meal.items.map((item) => (
            <li class="meal-item">
              <div class="meal-row">
                <span class="meal-name">{item.name}</span>
                {item.amount && <span class="meal-amount">{item.amount}</span>}
              </div>
              {item.allergens.length > 0 && (
                <div class="al-chips" aria-label="Alergeny">
                  {item.allergens.map((n) => (
                    <AllergenChip n={n} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {meal.allergensUnassigned.length > 0 && (
        <div class="meal-unassigned">
          <div class="al-chips">
            {meal.allergensUnassigned.map((n) => (
              <AllergenChip n={n} />
            ))}
          </div>
          <span class="muted">dotyczy posiłku</span>
        </div>
      )}
      {meal.notes.length > 0 && <p class="meal-note">Dopisek w jadłospisie: {meal.notes.join("; ")}</p>}
    </section>
  );
}

function MenuInfo({ status, week, highlighted }: { status: MenuStatus | null; week: MenuWeek | null; highlighted: number[] }) {
  const pageUrl = status?.menuPageUrl ?? MENU_PAGE_FALLBACK;
  // Link do PDF tylko dla dokumentu, który nadal jest na stronie stołówki (starsze pliki szkoła podmienia).
  const currentPdf = week && status?.currentSource?.sha256 === week.sourceSha256 ? week.sourceUrl : null;
  const notes = (week?.documentNotes ?? []).map((n) =>
    /zastrzegamy sobie prawo do modyfikacji/i.test(n) ? "Szkoła zastrzega sobie prawo do zmian w jadłospisie." : n,
  );
  return (
    <div class="menu-info">
      <section class="panel menu-allergens" id="alergeny" aria-labelledby="alergeny-title">
        <h2 id="alergeny-title">Informacje o alergenach</h2>
        <p class="muted">Numery przy potrawach oznaczają:</p>
        <ol class="al-dict">
          {Object.entries(ALLERGENS).map(([n, a]) => (
            <li class={highlighted.includes(Number(n)) ? "al-on" : undefined}>
              <span class="al-num">{n}</span>
              <span>{a.full}</span>
            </li>
          ))}
        </ol>
        <p class="menu-al-note">
          Oznaczenia alergenów przepisujemy bez zmian z jadłospisu stołówki szkoły. To informacja podana przez szkołę, a nie niezależna ocena
          bezpieczeństwa żywności – w razie wątpliwości zapytaj w przedszkolu lub u intendentki.
        </p>
        {status?.allergenDocUrl && (
          <a href={status.allergenDocUrl} target="_blank" rel="noopener" class="menu-doc-link">
            Dokument szkoły o alergenach (PDF)
          </a>
        )}
      </section>

      <section class="panel menu-source" id="o-jadlospisie" aria-labelledby="zrodlo-title">
        <h2 id="zrodlo-title">Skąd jest jadłospis?</h2>
        <p>Odczytujemy go automatycznie z jadłospisu tygodniowego stołówki ZSP w Żernicy.</p>
        {currentPdf && week && (
          <a href={currentPdf} target="_blank" rel="noopener">
            Jadłospis {shortRange(week)} (PDF)
          </a>
        )}
        <a href={pageUrl} target="_blank" rel="noopener">
          Strona stołówki
        </a>
        <p>Sprawdzamy stronę stołówki: {MENU_CHECK_SCHEDULE.join(" ").toLocaleLowerCase("pl")}</p>
        {status?.lastDataChange && <p>Ostatnia zmiana w jadłospisie: {formatTimestamp(status.lastDataChange)}</p>}
        {status?.lastSuccess && <p>Ostatnio potwierdzona aktualność: {formatTimestamp(status.lastSuccess)}</p>}
        {notes.map((n) => (
          <p class="small muted">{n}</p>
        ))}
      </section>
    </div>
  );
}

function MealIcon({ meal }: { meal: MealKey }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": true } as const;
  if (meal === "sniadanie")
    return (
      <svg {...common}>
        <path d="M3 18h18M7 18a5 5 0 0110 0M12 5v3M5 10l1.8 1.3M19 10l-1.8 1.3" />
      </svg>
    );
  if (meal === "obiad")
    return (
      <svg {...common}>
        <path d="M3.5 11h17a8.5 8.5 0 01-17 0z" />
        <path d="M9 7.5c0-1 1-1.5 1-2.5M13.5 7.5c0-1 1-1.5 1-2.5M8 20.5h8" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M5 9h11v5a5 5 0 01-5 5h-1a5 5 0 01-5-5z" />
      <path d="M16 10.5h1.5a2.5 2.5 0 010 5H16M8 3.5v2.5M11.5 3.5v2.5" />
    </svg>
  );
}

export function PlanNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

export function MenuNavIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <path d="M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10M17 21V3c-2.2 1.2-3.5 4-3.5 8h3.5" />
    </svg>
  );
}

