import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import type { Notice, PublishedActivity, PublishedSchedule, SchoolEvent, SyncStatus } from "../../src/published";
import {
  calendarEvent,
  googleCalendarUrl,
  icsCalendarDataUrl,
  icsDataUrl,
  icsFileName,
  schoolCalendarEvent,
  type CalendarEvent,
} from "./calendar";
import {
  calendarGrid,
  currentMonth,
  dayMonth,
  daysBetween,
  formatCheck,
  formatDay,
  formatMonth,
  formatShortDay,
  formatTimeRange,
  formatTimestamp,
  isoWeek,
  mondayOf,
  monthKey,
  todayIso,
  warsawDate,
  weekRangeLabel,
  weekdayLong,
  type Month,
} from "./dates";
import {
  AddToCalendarIcon,
  CancelIcon,
  CheckIcon,
  FlagIcon,
  InfoIcon,
  KNOWN_KINDS,
  KindIcon,
  MegaphoneIcon,
  PaletteIcon,
  ShareIcon,
  StarIcon,
  WarnIcon,
  WolfLogo,
  kindOf,
  shortName,
  tinyName,
  type KindKey,
} from "./kinds";
import {
  activityKey,
  activityTypes,
  isSelected,
  loadSelection,
  sameKind,
  saveSelection,
  selectionFromCodes,
  shareLink,
  unseenTypes,
  type ActivityType,
  type Selection,
} from "./selection";
import { applyTheme, loadTheme, type Theme } from "./theme";

type View = "list" | "calendar";

/** Wpis na liście dnia: termin albo „ślad” po terminie przeniesionym na inny dzień. */
interface DayItem {
  activity: PublishedActivity;
  movedAway: boolean;
}

/** Wpis dnia: zajęcia projektu albo wydarzenie w grupie. */
type DayEntry = DayItem | { event: SchoolEvent };

/** Zmiany wykryte po podmianie pliku tabeli na stronie przedszkola. */
const SCHEDULE_CHANGE: Record<NonNullable<PublishedActivity["scheduleChange"]>["kind"], string> = {
  removed: "Usunięte z harmonogramu przy aktualizacji tabeli",
  moved: "Zmienione przy aktualizacji tabeli",
  added: "Dodane przy aktualizacji tabeli",
};

const STORAGE_VIEW = "wkz.view";
const STALE_AFTER_HOURS = 36;
const SOURCE_FALLBACK = "https://przedszkole-zspzernica.pilchowice.pl/harmonogram-zajec-w-krainie-zabawy/";
/** Domyślny widok zależy od wyglądu; wybór rodzica (zapamiętany) ma pierwszeństwo. */
const DEFAULT_VIEW: Record<Theme, View> = { nowoczesny: "list", przyjazny: "calendar" };

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* tryb prywatny – bez zapamiętywania */
  }
}

/**
 * Grupa i widok w adresie (#grupa=wilczki&widok=lista) – można wysłać link innemu rodzicowi.
 * „moje” to wybór zajęć udostępniony linkiem (kody rodzajów zajęć).
 */
function readHash(): { group: string | null; view: View | null; myCodes: string | null } {
  const params = new URLSearchParams(location.hash.slice(1));
  const view = params.get("widok");
  return {
    group: params.get("grupa"),
    view: view === "kalendarz" ? "calendar" : view === "lista" ? "list" : null,
    myCodes: params.get("moje"),
  };
}

function storedView(): View | null {
  const v = readStorage(STORAGE_VIEW);
  return v === "calendar" || v === "list" ? v : null;
}

function useData() {
  const [schedule, setSchedule] = useState<PublishedSchedule | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const load = async (file: string) => {
      const res = await fetch(`./data/${file}`, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };
    load("schedule.json")
      .then(setSchedule)
      .catch(() => setError("Nie udało się wczytać harmonogramu. Sprawdź połączenie z internetem i odśwież stronę."));
    load("status.json").then(setStatus).catch(() => setStatus(null));
  }, []);
  return { schedule, status, error };
}

function isStale(status: SyncStatus | null): boolean {
  if (!status?.lastChecked) return false;
  const hoursSinceSuccess = status.lastSuccess ? (Date.now() - Date.parse(status.lastSuccess)) / 36e5 : Infinity;
  return status.errors.length > 0 || hoursSinceSuccess >= STALE_AFTER_HOURS;
}

/** 1 → one, 2–4 (bez 12–14) → few, reszta → many. */
function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const tens = n % 100;
  return n % 10 >= 2 && n % 10 <= 4 && (tens < 12 || tens > 14) ? few : many;
}

const pageUrl = () => location.origin + location.pathname;

export function App() {
  const { schedule, status, error } = useData();
  const [theme, setThemeState] = useState<Theme>(loadTheme);
  const initial = readHash();
  // Odczytujemy raz – po pierwszym renderze adres jest nadpisywany (bez „moje”).
  const [linkCodes] = useState(() => ({ group: initial.group, codes: initial.myCodes }));
  const [view, setViewState] = useState<View>(() => initial.view ?? storedView() ?? DEFAULT_VIEW[loadTheme()]);
  // Publikujemy tylko bieżący miesiąc – bez przeglądania innych.
  const month = currentMonth();

  const setTheme = (t: Theme) => {
    applyTheme(t);
    setThemeState(t);
    // Bez własnego wyboru widoku rodzic dostaje domyślny widok nowego wyglądu.
    if (!storedView()) setViewState(DEFAULT_VIEW[t]);
  };
  const setView = (v: View) => {
    writeStorage(STORAGE_VIEW, v);
    setViewState(v);
  };

  // MVP: jedna udostępniona grupa (config/groups.json → publicGroups); kod przyjmie kolejne z adresu.
  const groups = schedule?.groups ?? [];
  const group = groups.find((g) => g.id === initial.group) ?? groups[0] ?? null;

  useEffect(() => {
    if (!group) return;
    const params = new URLSearchParams({ grupa: group.id, widok: view === "calendar" ? "kalendarz" : "lista" });
    history.replaceState(null, "", `#${params}`);
  }, [group?.id, view]);

  if (error || !schedule || !group) {
    return (
      <Shell status={status} groupName={group?.name ?? "Wilczki"} sourcePage={schedule?.sourcePage}>
        {error ? (
          <div class="alert alert-error" role="alert">
            <WarnIcon />
            <div>
              <strong>Ups, brak danych.</strong> {error}
            </div>
          </div>
        ) : (
          <p class="message">{schedule ? "Brak opublikowanej grupy." : "Wczytywanie…"}</p>
        )}
        <ThemePicker theme={theme} onChange={setTheme} />
      </Shell>
    );
  }

  return (
    <GroupPage
      key={group.id}
      schedule={schedule}
      status={status}
      group={group}
      month={month}
      theme={theme}
      setTheme={setTheme}
      view={view}
      setView={setView}
      linkCodes={linkCodes.codes && (!linkCodes.group || linkCodes.group === group.id) ? linkCodes.codes : null}
    />
  );
}

function Shell(props: {
  status: SyncStatus | null;
  groupName: string;
  sourcePage?: string;
  myCount?: number;
  onMine?: () => void;
  children: ComponentChildren;
}) {
  return (
    <>
      <Header status={props.status} groupName={props.groupName} myCount={props.myCount} onMine={props.onMine} />
      <main class="container">
        <StaleBanner status={props.status} sourcePage={props.sourcePage} />
        {props.children}
        <Footer status={props.status} sourcePage={props.sourcePage} />
      </main>
    </>
  );
}

function Header(props: { status: SyncStatus | null; groupName: string; myCount?: number; onMine?: () => void }) {
  const stale = isStale(props.status);
  const checked = props.status?.lastChecked ? formatCheck(props.status.lastChecked) : null;
  const success = props.status?.lastSuccess ? formatCheck(props.status.lastSuccess) : null;
  return (
    <header class="site-header">
      <div class="header-inner">
        <span class="logo">
          <WolfLogo />
        </span>
        <div class="brand">
          <span class="brand-name">Plan przedszkolaka</span>
          <span class="brand-sub">Grupa {props.groupName} · Słoneczne Przedszkole w Żernicy</span>
        </div>
        <div class="header-spacer" />
        {checked && (
          <span class={`freshness${stale ? " freshness-stale" : ""}`}>
            {stale ? (
              <>
                <span class="fresh-dot" aria-hidden="true" />
                <span class="fresh-label">Sprawdzone</span> <span class="fresh-time">{success ?? checked}</span>
              </>
            ) : (
              <>
                <span class="fresh-dot" aria-hidden="true" />
                <span class="fresh-check" aria-hidden="true">
                  <CheckIcon />
                </span>
                <span class="fresh-label">Dane aktualne</span>
                <span class="fresh-label-short">Aktualne</span>
                <span class="fresh-time">
                  <span class="fresh-sep"> · sprawdzono </span>
                  <span class="fresh-sep-short"> · </span>
                  {checked}
                </span>
              </>
            )}
          </span>
        )}
        <a href="#wyglad" class="header-link">
          <PaletteIcon size={16} />
          Wygląd
        </a>
        <a href="#o-harmonogramie" class="header-link header-about">
          O harmonogramie
        </a>
        <a href="#o-harmonogramie" class="icon-btn header-info" aria-label="O harmonogramie">
          <InfoIcon />
        </a>
        {props.onMine && (
          <button type="button" class="btn btn-accent header-mine" onClick={props.onMine}>
            <StarIcon filled size={17} />
            Moje zajęcia{props.myCount ? <span class="count-pill">{props.myCount}</span> : null}
          </button>
        )}
      </div>
    </header>
  );
}

/** Ostrzeżenie, gdy ostatnia synchronizacja się nie udała albo dane są stare. */
function StaleBanner({ status, sourcePage }: { status: SyncStatus | null; sourcePage?: string }) {
  if (!isStale(status)) return null;
  return (
    <div class="alert alert-warn" role="status">
      <span class="alert-icon">
        <WarnIcon />
      </span>
      <div class="alert-body">
        <strong>Dane mogą być nieaktualne</strong>
        <span>
          Nie udało się ostatnio w pełni sprawdzić strony przedszkola
          {status?.lastSuccess ? ` (ostatnio udało się: ${formatCheck(status.lastSuccess)})` : ""}. Pokazujemy ostatnie sprawdzone dane – w
          razie wątpliwości zajrzyj na stronę przedszkola.
        </span>
        <a href={sourcePage ?? SOURCE_FALLBACK} target="_blank" rel="noopener">
          Otwórz stronę przedszkola
        </a>
      </div>
    </div>
  );
}

function Footer({ status, sourcePage }: { status: SyncStatus | null; sourcePage?: string }) {
  return (
    <footer class="site-footer" id="o-harmonogramie">
      <p class="footer-about">
        <strong>O harmonogramie.</strong> Zajęcia dodatkowe z projektu „W krainie zabawy” są odczytywane automatycznie z{" "}
        <a href={sourcePage ?? SOURCE_FALLBACK} target="_blank" rel="noopener">
          oficjalnej strony przedszkola
        </a>{" "}
        – w razie rozbieżności obowiązuje strona przedszkola. Wydarzenia w grupie pochodzą z wiadomości od wychowawczyni.
      </p>
      <p class="footer-dates">
        {status?.lastChecked && <>Ostatnie sprawdzenie: {formatTimestamp(status.lastChecked)}</>}
        {status?.lastDataChange && (
          <>
            <br />
            Ostatnia zmiana w harmonogramie: {formatTimestamp(status.lastDataChange)}
          </>
        )}
      </p>
    </footer>
  );
}

function ThemePicker({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  const options: { value: Theme; name: string; desc: string }[] = [
    { value: "nowoczesny", name: "Nowoczesny minimalistyczny", desc: "Prosty układ, stonowane kolory, oszczędne elementy." },
    { value: "przyjazny", name: "Miękki i przyjazny", desc: "Pastelowe kolory, zaokrąglone karty, łagodne kształty." },
  ];
  return (
    <section class="panel theme-picker" id="wyglad" aria-labelledby="wyglad-title">
      <div class="panel-head">
        <h2 id="wyglad-title">Wygląd strony</h2>
        <span class="muted">
          Wybierz wygląd, który najbardziej Ci odpowiada. Zapamiętamy go na tym urządzeniu – przy kolejnym otwarciu strona pokaże się w tym samym
          wyglądzie.
        </span>
      </div>
      <div class="theme-options" role="radiogroup" aria-label="Wygląd strony">
        {options.map((o) => (
          <label class={`theme-option${theme === o.value ? " checked" : ""}`}>
            <input type="radio" name="wyglad" value={o.value} checked={theme === o.value} onChange={() => onChange(o.value)} />
            <span class={`theme-thumb thumb-${o.value}`} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span class="theme-text">
              <span class="theme-name">{o.name}</span>
              <span class="muted">{o.desc}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

function GroupPage(props: {
  schedule: PublishedSchedule;
  status: SyncStatus | null;
  group: { id: string; name: string };
  month: Month;
  theme: Theme;
  setTheme: (t: Theme) => void;
  view: View;
  setView: (v: View) => void;
  /** Wybór zajęć z udostępnionego linku (do zapisania na tym urządzeniu). */
  linkCodes: string | null;
}) {
  const { schedule, month, theme } = props;
  const group = props.group.id;
  const groupName = props.group.name;
  const prefix = monthKey(month);
  const today = todayIso();
  const friendly = theme === "przyjazny";

  const groupActivities = useMemo(
    () => schedule.activities.filter((a) => a.group === group && (a.date.startsWith(prefix) || a.previous?.date.startsWith(prefix))),
    [schedule, group, prefix],
  );
  const groupEvents = useMemo(
    () => (schedule.events ?? []).filter((e) => e.group === group && daysBetween(e.date, e.endDate ?? e.date).some((d) => d.startsWith(prefix))),
    [schedule, group, prefix],
  );
  const types = useMemo(() => activityTypes(groupActivities), [groupActivities]);

  const [selection, setSelection] = useState<Selection | null>(() => loadSelection(group));
  // Domyślnie (przy każdym otwarciu strony) widać tylko wybrane zajęcia.
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Wybór z linku zapisujemy na tym urządzeniu.
  useEffect(() => {
    if (!props.linkCodes) return;
    const fromLink = selectionFromCodes(props.linkCodes, types);
    if (fromLink) {
      saveSelection(group, fromLink);
      setSelection(fromLink);
      setInfo(`Zapisano wybór zajęć z linku (${fromLink.selected.length}). Możesz go zmienić przyciskiem „Zmień wybór”.`);
    } else {
      setInfo("Link z wyborem zajęć nie pasuje do obecnego harmonogramu – wybierz zajęcia ponownie.");
    }
  }, []);

  const save = (next: Selection | null) => {
    saveSelection(group, next);
    setSelection(next);
    setEditing(false);
    setShowAll(false);
    setInfo(next ? null : "Wybór zajęć usunięty – widać wszystkie zajęcia grupy.");
  };

  /** Gwiazdka „Moje” przy zajęciach: dodaje albo usuwa cały rodzaj zajęć. */
  const toggleMine = (a: PublishedActivity) => {
    const key = activityKey(a.activity);
    const known = [...new Set([...(selection?.known ?? []), ...types.map((t) => t.key)])];
    const selected = selection?.selected ?? [];
    const next = isSelected({ selected, known }, a) ? selected.filter((s) => !sameKind(s, key)) : [...selected, key];
    saveSelection(group, next.length ? { selected: next, known } : null);
    setSelection(next.length ? { selected: next, known } : null);
    if (!next.length) setShowAll(false);
  };

  const share = async () => {
    if (!selection) return;
    const url = shareLink(group, selection);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Moje zajęcia – Plan przedszkolaka", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setInfo("Skopiowano link z wybranymi zajęciami. Otwórz go na innym urządzeniu albo wyślij drugiemu rodzicowi.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return; // rodzic zamknął okno udostępniania
      setInfo(`Link z wybranymi zajęciami: ${url}`);
    }
  };

  const openEditor = () => {
    setEditing(true);
    requestAnimationFrame(() => document.getElementById("moje-zajecia")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const filtering = selection !== null && !showAll;
  const unseen = selection ? unseenTypes(selection, types) : [];
  const mine = (a: PublishedActivity) => selection !== null && isSelected(selection, a);

  const byDay = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    const add = (day: string, item: DayEntry) => map.set(day, [...(map.get(day) ?? []), item]);
    // Wydarzenia w grupie zawsze – niezależnie od wyboru w „Moich zajęciach”; wielodniowe w każdym dniu.
    for (const e of groupEvents) for (const day of daysBetween(e.date, e.endDate ?? e.date)) if (day.startsWith(prefix)) add(day, { event: e });
    for (const a of groupActivities) {
      if (filtering && !isSelected(selection!, a)) continue;
      if (a.date.startsWith(prefix)) add(a.date, { activity: a, movedAway: false });
      // Na pierwotny dzień przeniesionych zajęć zostawiamy informację „przeniesione na…”.
      if (a.status === "rescheduled" && a.previous && a.previous.date !== a.date && a.previous.date.startsWith(prefix)) {
        add(a.previous.date, { activity: a, movedAway: true });
      }
    }
    // Wydarzenia na początku dnia, potem zajęcia według godziny.
    const startOf = (i: DayEntry) => ("event" in i ? "" : ((i.movedAway ? i.activity.previous?.start : i.activity.start) ?? "99:99"));
    for (const items of map.values()) items.sort((x, y) => startOf(x).localeCompare(startOf(y)));
    return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }, [groupActivities, groupEvents, filtering, selection, prefix]);

  // Komunikaty o minionych dniach chowamy, tak jak minione dni na liście.
  const notices = schedule.notices.filter(
    (n) =>
      !n.removedAt &&
      (n.groups === "all" || n.groups.includes(group)) &&
      (n.dates.length === 0 || n.dates.some((d) => d.startsWith(prefix))) &&
      !(n.dates.length > 0 && n.dates.every((d) => d < today)),
  );

  // W kalendarzu domyślnie zaznaczony jest dziś albo najbliższy dzień z zajęciami.
  const days = [...byDay.keys()];
  const day = selectedDay ?? (byDay.has(today) ? today : (days.find((d) => d >= today) ?? days.at(-1) ?? null));

  const ctx: CardContext = { groupName, mine, toggleMine };
  const summary = {
    activities: groupActivities.filter((a) => a.date.startsWith(prefix)).length,
    events: groupEvents.length,
    cancelled: groupActivities.filter((a) => a.status === "cancelled" && a.date.startsWith(prefix)).length,
  };

  const monthBar = (
    <MonthBar
      month={month}
      summary={summary}
      view={props.view}
      setView={props.setView}
      filtering={filtering}
      selectionCount={selection?.selected.length ?? 0}
      onAll={() => setShowAll(true)}
      onMine={() => (selection ? setShowAll(false) : openEditor())}
      onEdit={openEditor}
    />
  );

  const empty =
    byDay.size === 0 ? (
      <p class="message">{filtering ? "W tym miesiącu nie ma terminów wybranych zajęć." : "Brak opublikowanych zajęć tej grupy w tym miesiącu."}</p>
    ) : null;

  const selectedPanel = props.view === "calendar" && day && (
    <SelectedDay day={day} items={byDay.get(day) ?? []} ctx={ctx} friendly={friendly} />
  );

  return (
    <Shell
      status={props.status}
      groupName={groupName}
      sourcePage={schedule.sourcePage}
      myCount={friendly ? (selection?.selected.length ?? 0) : undefined}
      onMine={friendly ? openEditor : undefined}
    >
      {friendly && <Greeting byDay={byDay} groupName={groupName} groupEvents={groupEvents} ctx={ctx} />}
      {!friendly && monthBar}

      {info && (
        <p class="alert alert-info" role="status">
          <span>{info}</span>
          <button type="button" class="icon-btn alert-close" aria-label="Zamknij" onClick={() => setInfo(null)}>
            ×
          </button>
        </p>
      )}
      {unseen.length > 0 && (
        <div class="alert alert-info" role="note">
          <span>
            <strong>Nowe zajęcia w harmonogramie:</strong> {unseen.map((t) => shortName(t.name)).join("; ")}. Sprawdź, czy dotyczą Twojego dziecka.
          </span>
          <button type="button" class="btn btn-small" onClick={openEditor}>
            Przejrzyj wybór
          </button>
        </div>
      )}
      {notices.map((n) => (
        <NoticeCard notice={n} sourcePage={schedule.sourcePage} />
      ))}

      <div class={`layout view-${props.view}`}>
        <section class={`primary${friendly ? " panel" : ""}`} aria-label={`Zajęcia – ${groupName}`}>
          {friendly && monthBar}
          {empty ??
            (props.view === "list" ? (
              <WeekList key={`${group}-${prefix}`} byDay={byDay} ctx={ctx} />
            ) : (
              <>
                <CalendarGrid month={month} byDay={byDay} selected={day} onSelect={setSelectedDay} big={friendly} ctx={ctx} />
                {!friendly && selectedPanel}
              </>
            ))}
        </section>

        <aside class="side">
          {friendly && selectedPanel}
          {!friendly && props.view === "list" && byDay.size > 0 && (
            <div class="panel">
              <div class="panel-head panel-head-row">
                <h2>{formatMonth(month).split(" ")[0]}</h2>
                <span class="muted">{groupName}</span>
              </div>
              <CalendarGrid
                month={month}
                byDay={byDay}
                selected={null}
                onSelect={(d) => d && document.getElementById(`d-${d}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                big={false}
                ctx={ctx}
              />
            </div>
          )}
          {groupEvents.length > 0 && <EventsCard events={groupEvents} groupName={groupName} />}
          {types.length > 0 && (
            <MyActivitiesCard
              types={types}
              selection={selection}
              editing={editing || !friendly}
              friendly={friendly}
              onSave={save}
              onEdit={openEditor}
              onCancel={() => setEditing(false)}
              onShare={share}
            />
          )}
        </aside>
      </div>

      <ThemePicker theme={theme} onChange={props.setTheme} />
    </Shell>
  );
}

interface CardContext {
  groupName: string;
  mine: (a: PublishedActivity) => boolean;
  toggleMine: (a: PublishedActivity) => void;
}

function MonthBar(props: {
  month: Month;
  summary: { activities: number; events: number; cancelled: number };
  view: View;
  setView: (v: View) => void;
  filtering: boolean;
  selectionCount: number;
  onAll: () => void;
  onMine: () => void;
  onEdit: () => void;
}) {
  const { activities, events, cancelled } = props.summary;
  const parts = [
    `${activities} ${plural(activities, "zajęcia dodatkowe", "zajęcia dodatkowe", "zajęć dodatkowych")}`,
    events > 0 && `${events} ${plural(events, "wydarzenie", "wydarzenia", "wydarzeń")} w grupie`,
    cancelled > 0 && `${cancelled} ${plural(cancelled, "odwołane", "odwołane", "odwołanych")}`,
  ].filter(Boolean);
  return (
    <div class="month-bar">
      <div class="month-title">
        <h1>{formatMonth(props.month)}</h1>
        <span class="muted month-summary">{parts.join(" · ")}</span>
      </div>
      <div class="month-controls">
        <div class="segmented" role="group" aria-label="Widok">
          <button type="button" aria-pressed={props.view === "list"} onClick={() => props.setView("list")}>
            Lista
          </button>
          <button type="button" aria-pressed={props.view === "calendar"} onClick={() => props.setView("calendar")}>
            Kalendarz
          </button>
        </div>
        <div class="segmented" role="group" aria-label="Pokazywane zajęcia">
          <button type="button" aria-pressed={!props.filtering} onClick={props.onAll}>
            Wszystkie
          </button>
          <button type="button" aria-pressed={props.filtering} onClick={props.onMine}>
            <StarIcon filled size={15} />
            <span class="mine-label">Moje zajęcia</span>
            {props.selectionCount > 0 && <span class="count-pill">{props.selectionCount}</span>}
          </button>
        </div>
      </div>
      {props.filtering && (
        <p class="filter-note muted">
          Moje zajęcia dodatkowe ({props.selectionCount}) + wydarzenia grupy ·{" "}
          <button type="button" class="link-btn" onClick={props.onEdit}>
            Zmień wybór
          </button>
        </p>
      )}
    </div>
  );
}

function NoticeCard({ notice, sourcePage }: { notice: Notice; sourcePage: string }) {
  return (
    <div class={`notice notice-${notice.kind}`} role="note">
      <span class="notice-icon">
        <MegaphoneIcon />
      </span>
      <div class="notice-body">
        <strong>Komunikat przedszkola:</strong> {notice.text}{" "}
        <span class="muted">
          {notice.kind === "info" ? "Harmonogram poniżej uwzględnia aktualną tabelę." : "Nie udało się automatycznie przypisać go do konkretnego terminu."}
        </span>
      </div>
      <a href={sourcePage} target="_blank" rel="noopener" class="notice-link">
        Szczegóły i źródło
      </a>
    </div>
  );
}

/** „Dzień dobry!” – wygląd przyjazny: co dziś i przypomnienie o jutrzejszym wydarzeniu. */
function Greeting(props: { byDay: Map<string, DayEntry[]>; groupName: string; groupEvents: SchoolEvent[]; ctx: CardContext }) {
  const today = todayIso();
  const tomorrowDate = new Date(`${today}T12:00:00Z`);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);

  const activitiesOn = (d: string) =>
    (props.byDay.get(d) ?? []).filter((i): i is DayItem => "activity" in i && !i.movedAway);
  const todays = activitiesOn(today);
  const count = todays.filter((i) => i.activity.status !== "cancelled").length;
  const next = count ? null : [...props.byDay.keys()].find((d) => d > today && activitiesOn(d).some((i) => i.activity.status !== "cancelled"));
  const shown = count ? todays : next ? activitiesOn(next) : [];
  const tomorrowEvent = props.groupEvents.find((e) => e.date <= tomorrow && (e.endDate ?? e.date) >= tomorrow);

  const headline =
    count === 0
      ? "Dzień dobry! Dziś nie ma zajęć dodatkowych."
      : count === 1
        ? "Dzień dobry! Dziś dzieci czekają jedne zajęcia."
        : `Dzień dobry! Dziś dzieci ${plural(count, "czekają", "czekają", "czeka")} ${count} ${plural(count, "zajęcia", "zajęcia", "zajęć")}.`;

  return (
    <section class="panel greeting" aria-labelledby="greeting-title">
      <div class="greeting-head">
        <span class="greeting-date">
          {formatDay(today)} · grupa {props.groupName}
        </span>
        <h1 id="greeting-title">{headline}</h1>
        {!count && next && <span class="muted">Najbliższe zajęcia: {formatDay(next).toLocaleLowerCase("pl")}</span>}
      </div>
      {shown.length > 0 && (
        <ul class="greeting-cards">
          {shown.map((i) => (
            <ActivityRow item={i} ctx={props.ctx} compact />
          ))}
        </ul>
      )}
      {tomorrowEvent && (
        <div class="reminder">
          <span class="event-tile">
            <FlagIcon />
          </span>
          <span class="reminder-text">
            <strong>
              Jutro, {dayMonth(tomorrow)}: {tomorrowEvent.title}.
            </strong>{" "}
            {tomorrowEvent.details}
          </span>
          <AddToCalendar event={schoolCalendarEvent(tomorrowEvent, props.groupName, pageUrl())} label={tomorrowEvent.title} />
        </div>
      )}
    </section>
  );
}

/** Lista pogrupowana po tygodniach i dniach; minione dni schowane pod przyciskiem. */
function WeekList({ byDay, ctx }: { byDay: Map<string, DayEntry[]>; ctx: CardContext }) {
  const today = todayIso();
  const [showPast, setShowPast] = useState(false);
  const entries = [...byDay.entries()];
  const pastCount = entries.filter(([d]) => d < today).length;
  const visible = showPast ? entries : entries.filter(([d]) => d >= today);

  const weeks: { monday: string; days: [string, DayEntry[]][] }[] = [];
  for (const entry of visible) {
    const monday = mondayOf(entry[0]);
    const week = weeks.at(-1)?.monday === monday ? weeks.at(-1)! : (weeks.push({ monday, days: [] }), weeks.at(-1)!);
    week.days.push(entry);
  }

  return (
    <div class="week-list">
      {pastCount > 0 && (
        <button type="button" class="past-toggle" aria-expanded={showPast} onClick={() => setShowPast(!showPast)}>
          {showPast ? "Ukryj minione dni" : `Pokaż minione dni (${pastCount})`}
        </button>
      )}
      {visible.length === 0 && <p class="message">Wszystkie zajęcia w tym miesiącu już się odbyły.</p>}
      {weeks.map((w) => {
        const all = w.days.flatMap(([, items]) => items);
        const acts = all.filter((i) => "activity" in i && !i.movedAway).length;
        const evs = new Set(all.flatMap((i) => ("event" in i ? [i.event.id] : []))).size;
        const countLabel = [acts && `${acts} ${plural(acts, "termin", "terminy", "terminów")}`, evs && `${evs} ${plural(evs, "wydarzenie", "wydarzenia", "wydarzeń")}`]
          .filter(Boolean)
          .join(" · ");
        return (
          <section class="week">
            <div class="week-head">
              <h2>
                Tydzień {isoWeek(w.monday)} · {weekRangeLabel(w.monday)}
              </h2>
              <span class="muted">{countLabel}</span>
            </div>
            <div class="week-days">
              {w.days.map(([d, items]) => (
                <DayBlock day={d} items={items} ctx={ctx} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DayBlock({ day, items, ctx }: { day: string; items: DayEntry[]; ctx: CardContext }) {
  const today = todayIso();
  return (
    <section class={`day${day === today ? " today" : ""}${day < today ? " past" : ""}`} id={`d-${day}`} aria-label={formatDay(day)}>
      <div class="day-head">
        <span class="day-name">{weekdayLong(day)}</span>
        <span class="day-num">{Number(day.slice(8))}</span>
        <h3 class="day-full">{formatDay(day)}</h3>
        {day === today && <span class="today-badge">dziś</span>}
      </div>
      <ul class="day-items">
        {items.map((item) => ("event" in item ? <EventRow event={item.event} ctx={ctx} /> : <ActivityRow item={item} ctx={ctx} />))}
      </ul>
    </section>
  );
}

function SelectedDay({ day, items, ctx, friendly }: { day: string; items: DayEntry[]; ctx: CardContext; friendly: boolean }) {
  return (
    <div class={friendly ? "panel selected-day" : "selected-day"}>
      {friendly && <span class="muted selected-label">Wybrany dzień</span>}
      {items.length ? (
        <DayBlock day={day} items={items} ctx={ctx} />
      ) : (
        <>
          <h3 class="day-full">{formatDay(day)}</h3>
          <p class="message muted">Tego dnia nie ma zajęć ani wydarzeń.</p>
        </>
      )}
    </div>
  );
}

/** Zajęcia „W krainie zabawy”: godzina · kolorowy kafelek · krótka nazwa i prowadzący · akcje. */
function ActivityRow({ item, ctx, compact = false }: { item: DayItem; ctx: CardContext; compact?: boolean }) {
  const a = item.activity;
  const today = todayIso();
  const kind: KindKey = kindOf(a.activity);
  const cancelled = a.status === "cancelled";
  const ghost = cancelled || item.movedAway;
  const review = a.verification === "needs_review";
  const isMine = ctx.mine(a);
  const time = item.movedAway ? formatTimeRange(a.previous!.start, a.previous!.end) : formatTimeRange(a.start, a.end);
  const event = !ghost && a.date >= today ? calendarEvent(a, ctx.groupName, pageUrl()) : null;
  const meta = [a.teacher, a.subgroup && `podgrupa ${a.subgroup}`, a.location && `miejsce: ${a.location}`].filter(Boolean).join(" · ");

  return (
    <li class={`row act kind-${kind}${ghost ? " ghost" : ""}${cancelled ? " cancelled" : ""}${review ? " review" : ""}${isMine ? " mine" : ""}`}>
      <span class="row-time">{time}</span>
      <span class="tile" aria-hidden="true">
        {cancelled ? <CancelIcon /> : <KindIcon kind={kind} />}
      </span>
      <div class="row-body">
        <span class="row-time-inline">{time}</span>
        <div class="row-title-line">
          <span class="row-title" title={a.activity}>
            {isMine && !ghost && (
              <span class="mine-star" aria-hidden="true">
                ★{" "}
              </span>
            )}
            {shortName(a.activity)}
          </span>
          <Badges item={item} />
        </div>
        {meta && <span class="row-meta">{meta}</span>}
        {review && <span class="row-warning">Termin niepotwierdzony – sprawdź go przed zajęciami.</span>}
        {!compact && <ActivityDetails activity={a} />}
      </div>
      {!compact && (
        <div class="row-actions">
          {event ? <AddToCalendar event={event} label={shortName(a.activity)} /> : <span class="action-spacer" />}
          {!item.movedAway && (
            <button
              type="button"
              class={`mine-btn${isMine ? " on" : ""}`}
              aria-pressed={isMine}
              aria-label={isMine ? "Usuń z moich zajęć" : "Dodaj do moich zajęć"}
              onClick={() => ctx.toggleMine(a)}
            >
              <StarIcon filled={isMine} />
              Moje
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function Badges({ item }: { item: DayItem }) {
  const a = item.activity;
  if (item.movedAway) return <span class="badge badge-moved">Przeniesione na {formatShortDay(a.date)}</span>;
  return (
    <>
      {a.status === "cancelled" && (
        <span class="badge badge-cancelled">
          <span class="badge-dot" aria-hidden="true" />
          Odwołane
        </span>
      )}
      {a.status === "rescheduled" && a.previous && (
        <span class="badge badge-moved">
          Przeniesione z {a.previous.date !== a.date ? formatShortDay(a.previous.date) : formatTimeRange(a.previous.start, a.previous.end)}
        </span>
      )}
      {a.status === "additional" && <span class="badge badge-new">Dodatkowe</span>}
      {a.scheduleChange?.kind === "added" && a.status !== "cancelled" && <span class="badge badge-new">Nowy termin</span>}
    </>
  );
}

/** Pełna nazwa, zmiany i źródła – rozwijane, żeby nie zaśmiecać listy. */
function ActivityDetails({ activity: a }: { activity: PublishedActivity }) {
  return (
    <details class="details">
      <summary>Szczegóły i źródło</summary>
      <p>{a.activity}</p>
      {a.scheduleChange && (
        <p>
          {SCHEDULE_CHANGE[a.scheduleChange.kind]} ({formatShortDay(warsawDate(a.scheduleChange.at))})
        </p>
      )}
      {a.verification === "needs_review" && (
        <ul class="review-reasons">
          {a.reviewReasons.map((r) => (
            <li>{r}</li>
          ))}
        </ul>
      )}
      {a.warnings.map((w) => (
        <p class="muted">{w}</p>
      ))}
      <ul class="sources">
        {a.sources.map((s) =>
          s.type === "schedule" ? (
            <li>
              Harmonogram:{" "}
              <a href={s.url} target="_blank" rel="noopener">
                tabela (obraz)
              </a>
              {s.cellText && <span class="muted"> – „{s.cellText}”</span>}
            </li>
          ) : s.type === "announcement" ? (
            <li>
              Ogłoszenie na stronie przedszkola: „{s.text.replace(/^[–-]\s*/, "")}”
              {s.removedAt && <span class="muted"> (później usunięte ze strony)</span>}
            </li>
          ) : (
            <li>Sprawdzone ręcznie{s.note ? `: ${s.note}` : ""}</li>
          ),
        )}
      </ul>
    </details>
  );
}

/** Wydarzenie w grupie – od wychowawczyni, dla wszystkich dzieci, widoczne zawsze. */
function EventRow({ event: e, ctx }: { event: SchoolEvent; ctx: CardContext }) {
  const today = todayIso();
  const cal = (e.endDate ?? e.date) >= today ? schoolCalendarEvent(e, ctx.groupName, pageUrl()) : null;
  return (
    <li class="row event">
      <span class="row-time" />
      <span class="tile event-tile" aria-hidden="true">
        <FlagIcon />
      </span>
      <div class="row-body">
        <span class="event-label">
          Wydarzenie w grupie{e.endDate ? ` · ${dayMonth(e.date)}–${dayMonth(e.endDate)}` : ""}
          {e.start ? ` · ${formatTimeRange(e.start, e.end)}` : ""}
        </span>
        <div class="row-title-line">
          <span class="row-title">{e.title}</span>
          <span class="badge badge-event">Wydarzenie w grupie</span>
        </div>
        {e.details && <span class="row-details">{e.details}</span>}
      </div>
      <div class="row-actions">
        {cal ? <AddToCalendar event={cal} label={e.title} /> : <span class="action-spacer" />}
        <span class="action-spacer mine-spacer" />
      </div>
    </li>
  );
}

/** Ikona „Dodaj do kalendarza” + menu: Google (Android) albo plik .ics (iPhone, Outlook). */
function AddToCalendar({ event, label }: { event: CalendarEvent; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span class="add-cal">
      <button
        type="button"
        class="icon-btn cal-btn"
        aria-label={`Dodaj do kalendarza: ${label}`}
        title="Dodaj do kalendarza"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <AddToCalendarIcon />
      </button>
      {open && (
        <span class="cal-menu" role="menu">
          <a class="btn btn-small" role="menuitem" href={googleCalendarUrl(event)} target="_blank" rel="noopener" onClick={() => setOpen(false)}>
            Kalendarz Google
          </a>
          <a class="btn btn-small" role="menuitem" href={icsDataUrl(event)} download={icsFileName(event)} onClick={() => setOpen(false)}>
            Apple, Outlook i inne
          </a>
          <span class="muted cal-note">Zmiany wprowadzone później przez przedszkole nie zaktualizują się w kalendarzu.</span>
        </span>
      )}
    </span>
  );
}

function EventsCard({ events, groupName }: { events: SchoolEvent[]; groupName: string }) {
  const today = todayIso();
  const upcoming = events.filter((e) => (e.endDate ?? e.date) >= today);
  const all = upcoming.map((e) => schoolCalendarEvent(e, groupName, pageUrl()));
  return (
    <div class="panel events-card">
      <div class="events-head">
        <span class="tile event-tile" aria-hidden="true">
          <FlagIcon />
        </span>
        <div class="panel-head">
          <h2>Wydarzenia w grupie</h2>
          <span class="muted">Od wychowawczyni</span>
        </div>
      </div>
      <ul class="events-list">
        {events.map((e) => (
          <li class={(e.endDate ?? e.date) < today ? "past" : ""}>
            <span class="events-date">
              {dayMonth(e.date)}
              {e.endDate ? `–${dayMonth(e.endDate)}` : ""} <span class="events-wd">{weekdayShort(e.date)}</span>
            </span>
            <span>{e.title}</span>
          </li>
        ))}
      </ul>
      {all.length > 0 && (
        <a class="btn btn-block" href={icsCalendarDataUrl(all)} download={`wydarzenia-${groupName.toLocaleLowerCase("pl")}-${events[0]!.date.slice(0, 7)}.ics`}>
          <AddToCalendarIcon size={16} />
          Dodaj wszystkie do kalendarza
        </a>
      )}
      <p class="muted small">Wydarzenia dotyczą wszystkich dzieci w grupie, więc są widoczne zawsze – także w widoku „Moje zajęcia”.</p>
    </div>
  );
}

function weekdayShort(iso: string): string {
  return ["nd", "pn", "wt", "śr", "czw", "pt", "sb"][new Date(`${iso}T12:00:00Z`).getUTCDay()]!;
}

/** „Zajęcia mojego dziecka”: lista z polami wyboru (nowoczesny) albo podsumowanie + edycja (przyjazny). */
function MyActivitiesCard(props: {
  types: ActivityType[];
  selection: Selection | null;
  editing: boolean;
  friendly: boolean;
  onSave: (s: Selection | null) => void;
  onEdit: () => void;
  onCancel: () => void;
  onShare: () => void;
}) {
  const chosen = props.types.filter((t) => props.selection?.selected.some((s) => sameKind(s, t.key)));
  const showEditor = props.editing || !props.selection;
  return (
    <section class="panel my-card" id="moje-zajecia" aria-labelledby="moje-title">
      <div class="panel-head">
        <h2 id="moje-title">{props.friendly ? (showEditor ? "Wybierz zajęcia dziecka" : "Moje zajęcia") : "Zajęcia mojego dziecka"}</h2>
        <span class="muted">
          Zajęcia dodatkowe „W krainie zabawy”
          {!props.friendly && props.selection ? ` · wybrane ${chosen.length} z ${props.types.length}` : ""}
        </span>
      </div>
      {showEditor ? (
        <SelectionEditor
          key={props.selection?.selected.join("|") ?? "none"}
          types={props.types}
          selection={props.selection}
          friendly={props.friendly}
          onSave={props.onSave}
          onCancel={props.friendly && props.selection ? props.onCancel : undefined}
          onShare={props.selection ? props.onShare : undefined}
        />
      ) : (
        <>
          <div class="chips">
            {chosen.map((t) => (
              <span class={`chip kind-${kindOf(t.name)}`}>{tinyName(t.name)}</span>
            ))}
          </div>
          <div class="btn-row">
            <button type="button" class="btn" onClick={props.onEdit}>
              Zmień wybór
            </button>
            <button type="button" class="btn" onClick={props.onShare}>
              <ShareIcon />
              Udostępnij drugiemu rodzicowi
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** Lista rodzajów zajęć grupy z polami do zaznaczenia. */
function SelectionEditor(props: {
  types: ActivityType[];
  selection: Selection | null;
  friendly: boolean;
  onSave: (s: Selection | null) => void;
  onCancel?: () => void;
  onShare?: () => void;
}) {
  const initiallyChecked = props.types.filter((t) => props.selection?.selected.some((s) => sameKind(s, t.key))).map((t) => t.key);
  const [checked, setChecked] = useState<string[]>(initiallyChecked);
  const toggle = (key: string) => setChecked((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));
  const save = () => {
    // Zachowujemy wybór zajęć, których w tym miesiącu nie ma (np. wrócą w następnym).
    const absent = (props.selection?.selected ?? []).filter((s) => !props.types.some((t) => sameKind(t.key, s)));
    const selected = [...checked, ...absent];
    const known = [...new Set([...(props.selection?.known ?? []), ...props.types.map((t) => t.key)])];
    props.onSave(selected.length ? { selected, known } : null);
  };
  return (
    <div class="editor">
      {!props.selection && <p class="muted">Zaznacz zajęcia swojego dziecka – strona będzie domyślnie pokazywać tylko je.</p>}
      <ul class="editor-list">
        {props.types.map((t) => {
          const kind = kindOf(t.name);
          return (
            <li>
              <label class={`editor-row kind-${kind}${checked.includes(t.key) ? " on" : ""}`}>
                <input type="checkbox" checked={checked.includes(t.key)} onChange={() => toggle(t.key)} />
                <span class="kind-dot" aria-hidden="true">
                  <KindIcon kind={kind} size={20} />
                </span>
                <span class="editor-name" title={t.name}>
                  {shortName(t.name)}
                  {t.teachers.length > 0 && <span class="muted editor-teacher">{t.teachers.join(", ")}</span>}
                </span>
                <span class="muted editor-count" aria-label={`${t.count} ${plural(t.count, "termin", "terminy", "terminów")} w tym miesiącu`}>
                  {t.count}×
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div class="btn-row">
        {props.onCancel && (
          <button type="button" class="btn" onClick={props.onCancel}>
            Anuluj
          </button>
        )}
        <button type="button" class="btn btn-primary btn-grow" onClick={save}>
          {props.friendly ? `Zapisz (${checked.length})` : "Zapisz wybór"}
        </button>
        {props.onShare && !props.friendly && (
          <button type="button" class="btn" onClick={props.onShare}>
            <ShareIcon />
            Udostępnij
          </button>
        )}
      </div>
      {checked.length > 0 && (
        <button type="button" class="link-btn" onClick={() => setChecked([])}>
          Odznacz wszystkie
        </button>
      )}
      <p class="muted small">Wybór zapisuje się tylko na tym urządzeniu, w tej przeglądarce – nie wysyłamy go nigdzie.</p>
    </div>
  );
}

/**
 * Kalendarz miesiąca. Kropki w kolorach zajęć (pusta = odwołane), kwadracik = wydarzenie.
 * Duża wersja (wygląd przyjazny na komputerze) pokazuje zamiast kropek etykiety zajęć.
 */
function CalendarGrid(props: {
  month: Month;
  byDay: Map<string, DayEntry[]>;
  selected: string | null;
  onSelect: (d: string | null) => void;
  big: boolean;
  ctx: CardContext;
}) {
  const today = todayIso();
  const cells = calendarGrid(props.month);
  const present = new Set<KindKey>();
  let anyCancelled = false;
  for (const items of props.byDay.values())
    for (const i of items)
      if ("activity" in i) {
        present.add(kindOf(i.activity.activity));
        if (i.activity.status === "cancelled") anyCancelled = true;
      }
  const anyEvent = [...props.byDay.values()].some((items) => items.some((i) => "event" in i));

  return (
    <div class={`calendar-wrap${props.big ? " big" : ""}`}>
      <div class="calendar" role="grid" aria-label={formatMonth(props.month)}>
        {["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"].map((d, i) => (
          <div class={`cal-head${i >= 5 ? " weekend" : ""}`} role="columnheader">
            {d}
          </div>
        ))}
        {cells.map((day, index) => {
          if (!day) return <div class="cal-cell empty" />;
          const items = props.byDay.get(day) ?? [];
          const events = items.filter((i): i is { event: SchoolEvent } => "event" in i);
          const acts = items.filter((i): i is DayItem => "activity" in i);
          const weekend = index % 7 >= 5;
          const label = `${formatDay(day)}${
            items.length
              ? `: ${[
                  events.length && `${events.length} ${plural(events.length, "wydarzenie", "wydarzenia", "wydarzeń")}`,
                  acts.length && `${acts.length} ${plural(acts.length, "zajęcia", "zajęcia", "zajęć")}`,
                ]
                  .filter(Boolean)
                  .join(", ")}`
              : ", brak zajęć"
          }`;
          return (
            <button
              type="button"
              class={`cal-cell${day === today ? " today" : ""}${day === props.selected ? " selected" : ""}${items.length ? " has" : ""}${weekend ? " weekend" : ""}${day < today ? " past" : ""}`}
              aria-label={label}
              aria-pressed={props.selected ? day === props.selected : undefined}
              disabled={items.length === 0}
              onClick={() => props.onSelect(day === props.selected ? null : day)}
            >
              <span class="cal-num">{Number(day.slice(8))}</span>
              <span class="dots" aria-hidden="true">
                {events.length > 0 && <span class="dot-event" />}
                {acts.slice(0, 3).map((i) => (
                  <span class={`dot kind-${kindOf(i.activity.activity)}${i.movedAway || i.activity.status === "cancelled" ? " hollow" : ""}`} />
                ))}
              </span>
              {props.big && (
                <span class="pills" aria-hidden="true">
                  {events.map((e) => (
                    <span class="pill pill-event">{e.event.title}</span>
                  ))}
                  {acts.map((i) => (
                    <span class={`pill kind-${kindOf(i.activity.activity)}${i.movedAway || i.activity.status === "cancelled" ? " cancelled" : ""}`}>
                      {props.ctx.mine(i.activity) && !i.movedAway && i.activity.status !== "cancelled" ? "★ " : ""}
                      {tinyName(i.activity.activity)}
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div class="legend legend-dots">
        {anyEvent && (
          <span class="legend-item legend-strong">
            <span class="dot-event" />
            Wydarzenie w grupie
          </span>
        )}
        {KNOWN_KINDS.filter((k) => present.has(k.key)).map((k) => (
          <span class="legend-item">
            <span class={`dot kind-${k.key}`} />
            {k.tiny}
          </span>
        ))}
        {present.has("other") && (
          <span class="legend-item">
            <span class="dot kind-other" />
            Inne zajęcia
          </span>
        )}
        {anyCancelled && (
          <span class="legend-item muted">
            <span class="dot hollow kind-other" />
            pusta kropka = odwołane
          </span>
        )}
      </div>
      {props.big && (
        <div class="legend legend-pills">
          {anyEvent && (
            <span class="legend-item">
              <span class="pill pill-event">Wydarzenie</span>wydarzenie w grupie
            </span>
          )}
          <span class="legend-item">
            <span class="legend-today" />
            dziś
          </span>
          <span class="legend-item">
            <span class="legend-selected" />
            wybrany dzień
          </span>
          {anyCancelled && (
            <span class="legend-item">
              <span class="pill cancelled">Odwołane</span>odwołane
            </span>
          )}
          <span class="legend-item">
            <span class="legend-star">★</span>moje zajęcia
          </span>
        </div>
      )}
    </div>
  );
}
