import { z } from "zod";

/**
 * Wynik odczytu jednej strony harmonogramu przez model.
 * Model ma PRZEPISAĆ to, co widzi – bez poprawiania i bez wnioskowania.
 * Interpretacja (rok, miesiąc, grupy, kontrola dni tygodnia) dzieje się w kodzie.
 */
export const ExtractedEntry = z.object({
  activity_name: z.string().describe("Nazwa zajęć z pierwszej kolumny wiersza, bez nazwiska prowadzącego"),
  teacher: z.string().nullable().describe("Prowadzący bez przedrostka 'p.', np. 'J. Bieniek'"),
  group_column: z.string().describe("Nagłówek kolumny grupy dokładnie jak w tabeli, np. 'SÓWKI'"),
  weekday: z.string().nullable().describe("Dzień tygodnia dokładnie jak w komórce, nawet jeśli nie pasuje do dat"),
  start: z.string().nullable().describe("Godzina rozpoczęcia w formacie HH:MM"),
  end: z.string().nullable().describe("Godzina zakończenia w formacie HH:MM"),
  dates: z.array(z.string()).describe("Daty z komórki w formacie DD.MM, w kolejności z komórki"),
  location: z.string().nullable().describe("Miejsce z dopisku 'Gr. …', np. 'Górnicza' lub 'Miki'"),
  subgroup: z.string().nullable().describe("Numer podgrupy, np. 'I' z 'Grupa I' lub 'Gr. Górnicza I'"),
  cell_text: z.string().describe("Pełny tekst komórki przepisany dosłownie"),
  uncertain: z.boolean().describe("true, jeśli cokolwiek w komórce jest nieczytelne, niepełne lub niejednoznaczne"),
  note: z.string().nullable().describe("Krótki opis wątpliwości, jeśli uncertain=true"),
});
export type ExtractedEntry = z.infer<typeof ExtractedEntry>;

export const PageExtraction = z.object({
  is_schedule: z.boolean().describe("Czy obraz zawiera tabelę harmonogramu zajęć"),
  title: z.string().nullable(),
  month_label: z.string().nullable().describe("Miesiąc i rok z nagłówka, np. 'PAŹDZIERNIK 2026'; null, jeśli go nie ma"),
  group_columns: z.array(z.string()).describe("Nagłówki kolumn grup od lewej do prawej"),
  entries: z.array(ExtractedEntry),
  issues: z.array(z.string()).describe("Ogólne problemy z odczytem całej strony"),
});
export type PageExtraction = z.infer<typeof PageExtraction>;

/**
 * Interpretacja jednej linii ogłoszenia. Model nie dopasowuje terminów –
 * podaje tylko, co ogłoszenie mówi. Dopasowanie robi kod (resolve.ts).
 */
export const AnnouncedChange = z.object({
  type: z
    .enum(["cancelled", "rescheduled", "additional", "time_changed", "other"])
    .describe("cancelled = odwołane; rescheduled = przeniesione na inny dzień; additional = dodatkowe zajęcia; time_changed = zmiana godziny tego samego dnia"),
  dates: z.array(z.string()).describe("Daty, których dotyczy zmiana (dla przeniesienia: data PIERWOTNA), format YYYY-MM-DD"),
  activity_ref: z.string().nullable().describe("Nazwa lub skrót zajęć dokładnie jak w ogłoszeniu, np. 'kk', 'Słowiki'"),
  group_refs: z
    .array(z.string())
    .describe("Grupy lub miejsca wymienione w ogłoszeniu, w mianowniku, np. 'Sówki', 'Miki'. Pusta lista, jeśli nie podano"),
  new_date: z.string().nullable().describe("Nowa data (przeniesienie), YYYY-MM-DD"),
  new_start: z.string().nullable().describe("Nowa lub podana godzina rozpoczęcia, HH:MM"),
  new_end: z.string().nullable().describe("Nowa lub podana godzina zakończenia, HH:MM"),
  uncertain: z.boolean().describe("true, jeśli ogłoszenie da się zrozumieć na więcej niż jeden sposób"),
  note: z.string().nullable(),
});
export type AnnouncedChange = z.infer<typeof AnnouncedChange>;

export const AnnouncementParse = z.object({
  is_schedule_change: z.boolean().describe("Czy linia ogłasza zmianę w zajęciach (a nie np. tytuł lub nagłówek)"),
  changes: z.array(AnnouncedChange).describe("Zwykle jedna zmiana; kilka, jeśli linia zawiera kilka niezależnych zmian"),
});
export type AnnouncementParse = z.infer<typeof AnnouncementParse>;

export interface AnnouncementRecord {
  text: string;
  textSha256: string;
  model: string;
  promptVersion: string;
  createdAt: string;
  usage: { input_tokens: number; output_tokens: number };
  output: AnnouncementParse;
}

export interface ExtractionRecord {
  documentUrl: string;
  documentSha256: string;
  run: string;
  model: string;
  promptVersion: string;
  createdAt: string;
  stopReason: string | null;
  usage: { input_tokens: number; output_tokens: number };
  output: PageExtraction;
}
