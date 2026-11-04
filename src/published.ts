// Format danych publikowanych dla strony. Wspólny dla synchronizacji (src/) i strony (web/),
// więc nie może importować niczego z Node.

export type Status = "scheduled" | "cancelled" | "rescheduled" | "additional";

export type Source =
  | { type: "schedule"; url: string; cellText: string | null; firstSeen: string }
  | { type: "announcement"; text: string; firstSeen: string; removedAt: string | null }
  | { type: "manual"; note: string | null };

export interface PublishedActivity {
  id: string;
  group: string;
  activity: string;
  teacher: string | null;
  date: string;
  start: string | null;
  end: string | null;
  location: string | null;
  subgroup: string | null;
  status: Status;
  previous: { date: string; start: string | null; end: string | null } | null;
  /**
   * Zmiana wykryta po podmianie pliku tabeli na stronie (bez ogłoszenia):
   * moved = przeniesione, removed = usunięte z tabeli (status cancelled), added = nowy termin.
   */
  scheduleChange?: { kind: "moved" | "removed" | "added"; at: string };
  verification: "verified" | "needs_review";
  reviewReasons: string[];
  warnings: string[];
  sources: Source[];
  updatedAt: string;
}

export interface Notice {
  id: string;
  /** review = nie udało się przypisać do terminu; info = tylko informacja (np. zaktualizowana tabela). */
  kind: "review" | "info";
  text: string;
  groups: string[] | "all";
  /** Daty z ogłoszenia (YYYY-MM-DD) – komunikat pokazujemy w miesiącach, których dotyczy. Puste = zawsze. */
  dates: string[];
  reason: string;
  firstSeen: string;
  removedAt: string | null;
}

/** Wydarzenie przedszkolne grupy (z wiadomości od wychowawczyni), niezależne od zajęć projektu. */
export interface SchoolEvent {
  id: string;
  group: string;
  date: string;
  /** Ostatni dzień wydarzenia wielodniowego; null = jeden dzień. */
  endDate: string | null;
  start: string | null;
  end: string | null;
  title: string;
  details: string | null;
  verification: "verified" | "needs_review";
  reviewReasons: string[];
  /** Plik z wiadomością, np. events/wilczki/2026-11.txt. */
  source: string;
}

export interface PublishedSchedule {
  sourcePage: string;
  groups: { id: string; name: string }[];
  activities: PublishedActivity[];
  notices: Notice[];
  /** Opcjonalne – starsze dane (np. w testach) go nie mają. */
  events?: SchoolEvent[];
}

export interface SyncStatus {
  /** Ostatnie sprawdzenie strony (udane lub nie). */
  lastChecked: string | null;
  /** Ostatnia synchronizacja bez żadnych błędów. */
  lastSuccess: string | null;
  /** Ostatnia zmiana danych widocznych dla rodziców. */
  lastDataChange: string | null;
  errors: string[];
}
