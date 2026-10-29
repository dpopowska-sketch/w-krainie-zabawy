import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Notice, PublishedActivity, PublishedSchedule, Status, SyncStatus } from "../../src/published";
import {
  WEEKDAYS_SHORT,
  addMonths,
  calendarGrid,
  currentMonth,
  formatDay,
  formatMonth,
  formatShortDay,
  formatTimeRange,
  formatTimestamp,
  monthKey,
  parseMonthKey,
  todayIso,
  type Month,
} from "./dates";

type View = "list" | "calendar";

/** Wpis na liście dnia: termin albo „ślad” po terminie przeniesionym na inny dzień. */
interface DayItem {
  activity: PublishedActivity;
  movedAway: boolean;
}

const STORAGE_GROUP = "wkz.group";
const STORAGE_VIEW = "wkz.view";
const STALE_AFTER_HOURS = 36;

const STATUS_LABEL: Record<Status, string> = {
  scheduled: "",
  cancelled: "Odwołane",
  rescheduled: "Przeniesione",
  additional: "Dodatkowe",
};

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

/** Grupa i miesiąc w adresie (#grupa=sowki&miesiac=2026-10) – można wysłać link innemu rodzicowi. */
function readHash(): { group: string | null; month: Month | null; view: View | null } {
  const params = new URLSearchParams(location.hash.slice(1));
  const view = params.get("widok");
  return {
    group: params.get("grupa"),
    month: parseMonthKey(params.get("miesiac")),
    view: view === "kalendarz" ? "calendar" : view === "lista" ? "list" : null,
  };
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

export function App() {
  const { schedule, status, error } = useData();
  const initial = readHash();
  const [group, setGroup] = useState<string | null>(initial.group ?? readStorage(STORAGE_GROUP));
  const [month, setMonth] = useState<Month>(initial.month ?? currentMonth());
  const [view, setView] = useState<View>(initial.view ?? (readStorage(STORAGE_VIEW) === "calendar" ? "calendar" : "list"));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    if (group) writeStorage(STORAGE_GROUP, group);
    const params = new URLSearchParams();
    if (group) params.set("grupa", group);
    params.set("miesiac", monthKey(month));
    params.set("widok", view === "calendar" ? "kalendarz" : "lista");
    history.replaceState(null, "", `#${params}`);
  }, [group, month, view]);

  useEffect(() => writeStorage(STORAGE_VIEW, view), [view]);
  useEffect(() => setSelectedDay(null), [month, group]);

  if (error) return <Shell status={status}><p class="message error">{error}</p></Shell>;
  if (!schedule) return <Shell status={status}><p class="message">Wczytywanie…</p></Shell>;

  const validGroup = schedule.groups.some((g) => g.id === group) ? group : null;

  return (
    <Shell status={status} sourcePage={schedule.sourcePage}>
      <GroupPicker groups={schedule.groups} value={validGroup} onChange={setGroup} />
      {validGroup ? (
        <GroupSchedule
          schedule={schedule}
          group={validGroup}
          month={month}
          setMonth={setMonth}
          view={view}
          setView={setView}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
        />
      ) : (
        <p class="message">Wybierz grupę dziecka, aby zobaczyć jego zajęcia.</p>
      )}
    </Shell>
  );
}

function Shell(props: { status: SyncStatus | null; sourcePage?: string; children: ComponentChildren }) {
  return (
    <>
      <header class="header">
        <div class="header-inner">
          <h1>W krainie zabawy</h1>
          <p>Zajęcia dodatkowe · Słoneczne Przedszkole w Żernicy</p>
        </div>
      </header>
      <div class="page">
        <SyncBanner status={props.status} />
        <main>{props.children}</main>
        <Footer status={props.status} sourcePage={props.sourcePage} />
      </div>
    </>
  );
}

/** Ostrzeżenie, gdy ostatnia synchronizacja się nie udała albo dane są stare. */
function SyncBanner({ status }: { status: SyncStatus | null }) {
  if (!status?.lastChecked) return null;
  const hoursSinceSuccess = status.lastSuccess ? (Date.now() - Date.parse(status.lastSuccess)) / 36e5 : Infinity;
  if (status.errors.length === 0 && hoursSinceSuccess < STALE_AFTER_HOURS) return null;
  return (
    <div class="banner" role="status">
      Nie udało się ostatnio w pełni sprawdzić strony przedszkola
      {status.lastSuccess ? ` (ostatnio udało się: ${formatTimestamp(status.lastSuccess)})` : ""}. Pokazujemy ostatnie
      sprawdzone dane – w razie wątpliwości zajrzyj na stronę przedszkola.
    </div>
  );
}

function Footer({ status, sourcePage }: { status: SyncStatus | null; sourcePage?: string }) {
  return (
    <footer class="footer">
      {status?.lastChecked && <p>Ostatnie sprawdzenie strony przedszkola: {formatTimestamp(status.lastChecked)}</p>}
      {status?.lastDataChange && <p>Ostatnia zmiana w harmonogramie: {formatTimestamp(status.lastDataChange)}</p>}
      <p>
        Harmonogram jest odczytywany automatycznie z{" "}
        <a href={sourcePage ?? "https://przedszkole-zspzernica.pilchowice.pl/harmonogram-zajec-w-krainie-zabawy/"} target="_blank" rel="noopener">
          oficjalnej strony przedszkola
        </a>
        . W razie rozbieżności obowiązuje strona przedszkola.
      </p>
    </footer>
  );
}

function GroupPicker(props: { groups: PublishedSchedule["groups"]; value: string | null; onChange: (g: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  // Na wąskim ekranie pasek grup się przewija – wybrana grupa ma być widoczna.
  useEffect(() => {
    const chip = ref.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    const nav = ref.current;
    if (chip && nav) nav.scrollLeft = Math.max(0, chip.offsetLeft - nav.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2);
  }, [props.value]);
  return (
    <nav class="groups" aria-label="Grupa" ref={ref}>
      {props.groups.map((g) => (
        <button type="button" class="chip" aria-pressed={props.value === g.id} onClick={() => props.onChange(g.id)}>
          {g.name}
        </button>
      ))}
    </nav>
  );
}

function GroupSchedule(props: {
  schedule: PublishedSchedule;
  group: string;
  month: Month;
  setMonth: (m: Month) => void;
  view: View;
  setView: (v: View) => void;
  selectedDay: string | null;
  setSelectedDay: (d: string | null) => void;
}) {
  const { schedule, group, month } = props;
  const prefix = monthKey(month);

  const byDay = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    const add = (day: string, item: DayItem) => map.set(day, [...(map.get(day) ?? []), item]);
    for (const a of schedule.activities) {
      if (a.group !== group) continue;
      if (a.date.startsWith(prefix)) add(a.date, { activity: a, movedAway: false });
      // Na pierwotny dzień przeniesionych zajęć zostawiamy informację „przeniesione na…”.
      if (a.status === "rescheduled" && a.previous && a.previous.date !== a.date && a.previous.date.startsWith(prefix)) {
        add(a.previous.date, { activity: a, movedAway: true });
      }
    }
    const startOf = (i: DayItem) => (i.movedAway ? i.activity.previous?.start : i.activity.start) ?? "99:99";
    for (const items of map.values()) items.sort((x, y) => startOf(x).localeCompare(startOf(y)));
    return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }, [schedule, group, prefix]);

  const notices = schedule.notices.filter(
    (n) =>
      !n.removedAt &&
      (n.groups === "all" || n.groups.includes(group)) &&
      (n.dates.length === 0 || n.dates.some((d) => d.startsWith(prefix))),
  );
  const groupName = schedule.groups.find((g) => g.id === group)?.name ?? group;
  const isCurrent = monthKey(currentMonth()) === prefix;

  // Najbliższy miesiąc z zajęciami – podpowiedź, gdy w wybranym nic nie ma.
  const monthsWithData = [...new Set(schedule.activities.filter((a) => a.group === group).map((a) => a.date.slice(0, 7)))].sort();

  return (
    <section aria-label={`Zajęcia – ${groupName}`}>
      <div class="toolbar">
        <div class="month-nav">
          <button type="button" class="icon" aria-label="Poprzedni miesiąc" onClick={() => props.setMonth(addMonths(month, -1))}>‹</button>
          <h2>{formatMonth(month)}</h2>
          <button type="button" class="icon" aria-label="Następny miesiąc" onClick={() => props.setMonth(addMonths(month, 1))}>›</button>
        </div>
        <div class="toolbar-right">
          {!isCurrent && (
            <button type="button" class="link" onClick={() => props.setMonth(currentMonth())}>Bieżący miesiąc</button>
          )}
          <div class="segmented" role="group" aria-label="Widok">
            <button type="button" aria-pressed={props.view === "list"} onClick={() => props.setView("list")}>Lista</button>
            <button type="button" aria-pressed={props.view === "calendar"} onClick={() => props.setView("calendar")}>Kalendarz</button>
          </div>
        </div>
      </div>

      {notices.map((n) => <NoticeBox notice={n} />)}

      {byDay.size === 0 ? (
        <EmptyMonth months={monthsWithData} current={prefix} onPick={(key) => props.setMonth(parseMonthKey(key)!)} />
      ) : props.view === "list" ? (
        <DayList byDay={byDay} />
      ) : (
        <Calendar month={month} byDay={byDay} selected={props.selectedDay} onSelect={props.setSelectedDay} />
      )}
    </section>
  );
}

function NoticeBox({ notice }: { notice: Notice }) {
  return (
    <div class="notice" role="note">
      <strong>Komunikat przedszkola:</strong> {notice.text}
      <span class="muted"> Nie udało się automatycznie przypisać go do konkretnego terminu.</span>
    </div>
  );
}

function EmptyMonth(props: { months: string[]; current: string; onPick: (key: string) => void }) {
  const later = props.months.find((m) => m > props.current);
  const earlier = [...props.months].reverse().find((m) => m < props.current);
  const suggestion = later ?? earlier;
  return (
    <div class="message">
      <p>Brak opublikowanych zajęć tej grupy w tym miesiącu.</p>
      {suggestion && (
        <button type="button" class="link" onClick={() => props.onPick(suggestion)}>
          Pokaż {formatMonth(parseMonthKey(suggestion)!).toLocaleLowerCase("pl")}
        </button>
      )}
    </div>
  );
}

function DayList({ byDay }: { byDay: Map<string, DayItem[]> }) {
  const today = todayIso();
  return (
    <ol class="days">
      {[...byDay.entries()].map(([day, items]) => (
        <li class={`day${day === today ? " today" : ""}${day < today ? " past" : ""}`} id={`d-${day}`}>
          <h3>
            {formatDay(day)}
            {day === today && <span class="today-badge">dziś</span>}
          </h3>
          <ul class="cards">
            {items.map((item) => <ActivityCard item={item} />)}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function ActivityCard({ item }: { item: DayItem }) {
  const a = item.activity;
  const status: Status | "moved-away" = item.movedAway ? "moved-away" : a.status;
  const review = a.verification === "needs_review";
  return (
    <li class={`card status-${status}${review ? " review" : ""}`}>
      <div class="card-time">
        {item.movedAway ? formatTimeRange(a.previous!.start, a.previous!.end) : formatTimeRange(a.start, a.end)}
      </div>
      <div class="card-body">
        <div class="card-title">
          <span class="activity">{a.activity}</span>
          {status === "moved-away" ? (
            <span class="badge badge-rescheduled">Przeniesione</span>
          ) : (
            STATUS_LABEL[a.status] && <span class={`badge badge-${a.status}`}>{STATUS_LABEL[a.status]}</span>
          )}
          {review && <span class="badge badge-review">Niezweryfikowane</span>}
        </div>
        <div class="card-meta">
          {[a.teacher && `prowadzi ${a.teacher}`, a.subgroup && `podgrupa ${a.subgroup}`, a.location && `miejsce: ${a.location}`]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {item.movedAway && (
          <div class="change">
            Przeniesione na {formatShortDay(a.date)}, {formatTimeRange(a.start, a.end)}
          </div>
        )}
        {!item.movedAway && a.status === "rescheduled" && a.previous && (
          <div class="change">
            Wcześniej: {a.previous.date !== a.date ? `${formatShortDay(a.previous.date)}, ` : ""}
            {formatTimeRange(a.previous.start, a.previous.end)}
          </div>
        )}
        <Details activity={a} />
      </div>
    </li>
  );
}

/** Źródła i powody weryfikacji – rozwijane, żeby nie zaśmiecać listy. */
function Details({ activity: a }: { activity: PublishedActivity }) {
  return (
    <details class="details">
      <summary>Szczegóły i źródło</summary>
      {a.verification === "needs_review" && (
        <div class="review-box">
          <p>
            Tego terminu nie udało się w pełni potwierdzić automatycznie. Sprawdź go na stronie przedszkola.
          </p>
          <ul>
            {a.reviewReasons.map((r) => <li>{r}</li>)}
          </ul>
        </div>
      )}
      {a.warnings.map((w) => <p class="muted">{w}</p>)}
      <ul class="sources">
        {a.sources.map((s) =>
          s.type === "schedule" ? (
            <li>
              Harmonogram:{" "}
              <a href={s.url} target="_blank" rel="noopener">tabela (obraz)</a>
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

function Calendar(props: { month: Month; byDay: Map<string, DayItem[]>; selected: string | null; onSelect: (d: string | null) => void }) {
  const today = todayIso();
  const cells = calendarGrid(props.month);
  const selectedItems = props.selected ? props.byDay.get(props.selected) : undefined;
  return (
    <div>
      <div class="calendar" role="grid" aria-label={formatMonth(props.month)}>
        {WEEKDAYS_SHORT.map((d) => <div class="cal-head" role="columnheader">{d}</div>)}
        {cells.map((day) => {
          if (!day) return <div class="cal-cell empty" />;
          const items = props.byDay.get(day) ?? [];
          const statuses = items.map((i) => (i.movedAway ? "moved-away" : i.activity.status));
          const label = `${formatDay(day)}${items.length ? `, zajęć: ${items.length}` : ", brak zajęć"}`;
          return (
            <button
              type="button"
              class={`cal-cell${day === today ? " today" : ""}${day === props.selected ? " selected" : ""}${items.length ? " has" : ""}`}
              aria-label={label}
              aria-pressed={day === props.selected}
              disabled={items.length === 0}
              onClick={() => props.onSelect(day === props.selected ? null : day)}
            >
              <span class="cal-num">{Number(day.slice(8))}</span>
              <span class="dots" aria-hidden="true">
                {statuses.map((s) => <span class={`dot dot-${s}`} />)}
              </span>
            </button>
          );
        })}
      </div>
      <p class="legend">
        <span class="dot dot-scheduled" /> zajęcia <span class="dot dot-cancelled" /> odwołane{" "}
        <span class="dot dot-rescheduled" /> przeniesione <span class="dot dot-additional" /> dodatkowe
      </p>
      {selectedItems ? (
        <DayList byDay={new Map([[props.selected!, selectedItems]])} />
      ) : (
        <p class="message muted">Wybierz dzień, aby zobaczyć zajęcia.</p>
      )}
    </div>
  );
}
