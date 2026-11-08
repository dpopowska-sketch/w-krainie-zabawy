// „Kalendarz w telefonie”: subskrypcja, którą telefon sam odświeża. Cały harmonogram grupy albo tylko
// wybrane zajęcia (kody rodzajów zajęć jak w linku „moje=”). Wspólne dla funkcji Cloudflare
// (functions/kalendarz/[plik].ts) i testów.
import type { CalendarData } from "../../src/published.js";
import { calendarEvent, icsCalendarText, schoolCalendarEvent, type CalendarEvent } from "./calendar.js";
import { activityKey, sameKind, shortCode } from "./selection.js";

/** Adres na Cloudflare – tylko tam działa funkcja składająca kalendarz (GitHub Pages jej nie ma). */
export const FEED_ORIGIN = "https://wilczki-kalendarz.pages.dev";

/** Link do subskrypcji; `codes` = null → wszystkie zajęcia grupy. */
export function feedUrl(group: string, codes: string[] | null): string {
  const query = codes?.length ? `?moje=${codes.join(".")}` : "";
  return `${FEED_ORIGIN}/kalendarz/${group}.ics${query}`;
}

/** Kody wybranych rodzajów zajęć (Selection.selected) do linku. */
export function selectionCodes(selected: string[]): string[] {
  return [...new Set(selected.map(shortCode))].sort();
}

/**
 * Kalendarz .ics grupy; null, gdy grupy nie ma w danych. Odwołane zajęcia zostają z dopiskiem
 * „ODWOŁANE:”, żeby rodzic zauważył zmianę. Wydarzenia grupy są zawsze – także w wariancie „moje”.
 */
export function feedText(data: CalendarData, opts: { group: string; codes: string[] | null; now?: Date }): string | null {
  const group = data.groups.find((g) => g.id === opts.group);
  if (!group) return null;
  const pageUrl = `${FEED_ORIGIN}/#grupa=${group.id}`;
  const activities = data.activities.filter((a) => a.group === group.id);

  // Kod pasuje do nazwy z dowolnego miesiąca; sameKind łapie potem drobne różnice nazw między miesiącami.
  const codes = opts.codes ? new Set(opts.codes) : null;
  const wanted = codes ? [...new Set(activities.map((a) => activityKey(a.activity)))].filter((k) => codes.has(shortCode(k))) : [];
  const chosen = codes ? activities.filter((a) => wanted.some((w) => sameKind(w, activityKey(a.activity)))) : activities;

  const events: CalendarEvent[] = [];
  for (const a of chosen) {
    const e = calendarEvent(a, group.name, pageUrl);
    if (!e) continue;
    events.push(a.status === "cancelled" ? { ...e, title: `ODWOŁANE: ${e.title}`, cancelled: true } : e);
  }
  for (const e of data.events) if (e.group === group.id) events.push(schoolCalendarEvent(e, group.name, pageUrl));

  const name = `${group.name} – ${codes ? "moje zajęcia" : "wszystkie zajęcia"}`;
  return icsCalendarText(events, opts.now, { name });
}
