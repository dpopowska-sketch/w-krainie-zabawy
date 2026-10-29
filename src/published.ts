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
  verification: "verified" | "needs_review";
  reviewReasons: string[];
  warnings: string[];
  sources: Source[];
  updatedAt: string;
}

export interface Notice {
  id: string;
  text: string;
  groups: string[] | "all";
  /** Daty z ogłoszenia (YYYY-MM-DD) – komunikat pokazujemy w miesiącach, których dotyczy. Puste = zawsze. */
  dates: string[];
  reason: string;
  firstSeen: string;
  removedAt: string | null;
}

export interface PublishedSchedule {
  sourcePage: string;
  groups: { id: string; name: string }[];
  activities: PublishedActivity[];
  notices: Notice[];
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
