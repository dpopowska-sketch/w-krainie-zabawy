// „Moje zajęcia”: rodzaje zajęć wybrane przez rodzica, zapisywane tylko w przeglądarce
// (localStorage), osobno dla każdej grupy. Nic nie trafia na serwer.
import type { PublishedActivity } from "../../src/published";

export interface ActivityType {
  /** Znormalizowana nazwa – klucz rodzaju zajęć. */
  key: string;
  name: string;
  teachers: string[];
  /** Liczba terminów w bieżącym miesiącu. */
  count: number;
}

export interface Selection {
  /** Wybrane rodzaje zajęć (znormalizowane nazwy). */
  selected: string[];
  /** Wszystkie rodzaje zajęć, które rodzic widział przy zapisie – do wykrywania nowych. */
  known: string[];
}

const STORAGE_PREFIX = "wkz.moje.";

/** Nazwa bez wielkości liter, polskich znaków i interpunkcji. */
export function activityKey(name: string): string {
  return name
    .toLocaleLowerCase("pl")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^zajecia /, "")
    .trim();
}

/**
 * Te same zajęcia mimo drobnych różnic w nazwie między miesiącami
 * („Mały projektant i technolog” / „Mały Projektant”): zgodny początek nazwy.
 */
export function sameKind(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(20, a.length, b.length);
  return n >= 8 && a.slice(0, n) === b.slice(0, n);
}

export function activityTypes(activities: PublishedActivity[]): ActivityType[] {
  const types: ActivityType[] = [];
  for (const a of activities) {
    const key = activityKey(a.activity);
    let t = types.find((x) => sameKind(x.key, key));
    if (!t) types.push((t = { key, name: a.activity, teachers: [], count: 0 }));
    if (a.teacher && !t.teachers.includes(a.teacher)) t.teachers.push(a.teacher);
    t.count++;
  }
  return types.sort((x, y) => x.name.localeCompare(y.name, "pl"));
}

export function isSelected(selection: Selection, activity: PublishedActivity): boolean {
  const key = activityKey(activity.activity);
  return selection.selected.some((s) => sameKind(s, key));
}

/** Rodzaje zajęć, których rodzic jeszcze nie widział przy wyborze (np. nowe w tym miesiącu). */
export function unseenTypes(selection: Selection, types: ActivityType[]): ActivityType[] {
  return types.filter((t) => !selection.known.some((k) => sameKind(k, t.key)));
}

export function loadSelection(group: string): Selection | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + group);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Selection>;
    if (!Array.isArray(parsed.selected) || parsed.selected.length === 0) return null;
    return { selected: parsed.selected.map(String), known: Array.isArray(parsed.known) ? parsed.known.map(String) : [] };
  } catch {
    return null;
  }
}

export function saveSelection(group: string, selection: Selection | null) {
  try {
    if (selection && selection.selected.length) localStorage.setItem(STORAGE_PREFIX + group, JSON.stringify(selection));
    else localStorage.removeItem(STORAGE_PREFIX + group);
  } catch {
    /* tryb prywatny – wybór działa tylko do zamknięcia strony */
  }
}

/** Krótki kod rodzaju zajęć do linku (FNV-1a, 6 znaków). */
export function shortCode(key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(6, "0").slice(-6);
}

/** Link z wyborem: kody rodzajów zajęć w parametrze „moje”. */
export function shareLink(group: string, selection: Selection): string {
  const params = new URLSearchParams({ grupa: group, moje: selection.selected.map(shortCode).join(".") });
  return `${location.origin}${location.pathname}#${params}`;
}

/** Zamienia kody z linku na rodzaje zajęć z bieżącego harmonogramu. */
export function selectionFromCodes(codes: string, types: ActivityType[]): Selection | null {
  const wanted = new Set(codes.split(".").filter(Boolean));
  const selected = types.filter((t) => wanted.has(shortCode(t.key))).map((t) => t.key);
  return selected.length ? { selected, known: types.map((t) => t.key) } : null;
}
