# W krainie zabawy – harmonogram zajęć

Harmonogram zajęć dodatkowych projektu „W krainie zabawy” (Słoneczne Przedszkole w Żernicy),
pobierany automatycznie ze [strony przedszkola](https://przedszkole-zspzernica.pilchowice.pl/harmonogram-zajec-w-krainie-zabawy/).

## Uruchomienie

```bash
npm install
cp .env.example .env      # i wpisz ANTHROPIC_API_KEY

npm run sync              # wszystkie kroki naraz → data/published/schedule.json, data/status.json
```

Kroki można też uruchamiać osobno:

```bash
npm run discover          # pobiera stronę i załączniki → data/manifest.json, data/page.json
npm run extract           # odczyt obrazów przez Claude (2 przebiegi) → data/extractions/
npm run announcements     # interpretacja ogłoszeń i dopasowanie do terminów → data/changes.json
npm run build             # scalenie z decyzjami → data/published/schedule.json, review/pending.md
```

Do Claude trafiają tylko nowe pliki i nowe linie ogłoszeń (cache po hashu treści),
więc synchronizacja bez zmian na stronie nic nie kosztuje.

## Strona dla rodziców

```bash
npm run web:dev           # podgląd na żywo (http://localhost:5173)
npm run web:build         # wersja do publikacji → dist/
```

Vite + Preact w `web/`. Dane: `data/published/schedule.json` i `data/status.json`
(kopiowane do `web/public/data/` przy uruchomieniu). Strona nazywa się „Plan przedszkolaka”
i ma dwa wyglądy do wyboru przez rodzica (sekcja „Wygląd strony”): Ciepły i przyjazny
(domyślny) i Nowoczesny minimalistyczny – atrybut `data-theme` na `<html>`, zapamiętany w `localStorage`
pod kluczem `wygladStrony` (ustawiany przed pierwszym renderem w `web/index.html`). Kolory,
krótkie nazwy i ikony rodzajów zajęć: `web/src/kinds.tsx` + klasy `kind-*` w `web/src/styles.css`.
Wybrany widok jest zapamiętywany na urządzeniu; grupa i widok są też w adresie
(`#grupa=wilczki&widok=lista`), więc link można wysłać innemu rodzicowi.

## Widoczne grupy i historia zmian

W `config/groups.json`:

- `publicGroups` – grupy pokazywane na stronie (teraz tylko Wilczki). Pozostałe grupy są
  odczytywane i przetwarzane normalnie, więc udostępnienie kolejnej to dopisanie jej `id`.
- `historyGroups` – grupy, dla których prowadzona jest historia w `history/<grupa>/`:
  - `RRRR-MM.md` – harmonogram miesiąca (stan aktualny) i dziennik zmian z datami,
  - `events.json`, `state.json` – te same dane w formie do przetwarzania.

Strona pokazuje tylko bieżący miesiąc (czas polski); publiczny plik z danymi też zawiera
tylko bieżący miesiąc i widoczne grupy. Pełne dane zostają w repozytorium.

## Automatyczna synchronizacja

`.github/workflows/sync.yml` uruchamia `npm run sync` w GitHub Actions co godzinę
od 7:00 do 17:00 czasu polskiego (GitHub bywa spóźniony, zwykle do godziny), po każdej zmianie w repozytorium oraz ręcznie
(zakładka **Actions** → **Synchronizacja harmonogramu** → **Run workflow**). Wymaga sekretu
`ANTHROPIC_API_KEY` oraz włączonego GitHub Pages ze źródłem **GitHub Actions** (Settings → Pages).

Zmiany danych są zapisywane w repozytorium od razu; sam czas sprawdzenia – raz dziennie. Strona jest
publikowana tylko wtedy, gdy coś zapisano: zmiana danych, pojawienie się lub zniknięcie błędu synchronizacji
(ostrzeżenie dla rodziców, z ostatnimi sprawdzonymi danymi) albo dzienny czas sprawdzenia – oraz zawsze
po zmianie w repozytorium i przy ręcznym uruchomieniu.

## Weryfikacja ręczna

- `review/pending.md` – lista pozycji do sprawdzenia (generowana automatycznie).
- `review/decisions.yaml` – Twoje decyzje: `confirm`, `hide`, `edit`, `dismiss`.

Gdy strona przedszkola jest niedostępna albo odczyt się nie powiedzie, dane nie są
usuwane ani nadpisywane – błąd trafia do `data/status.json`.

## Wydarzenia przedszkolne

Wydarzenia grupy z comiesięcznej wiadomości od wychowawczyni (np. Dzień Postaci z Bajek, zebranie)
są pokazywane na liście i w kalendarzu obok zajęć – innym kolorem, z gwiazdką i zawsze, niezależnie
od wyboru w „Moich zajęciach”.

Dodawanie: na GitHubie **Add file → Create new file**, nazwa `events/<grupa>/RRRR-MM.txt`
(np. `events/wilczki/2026-12.txt`), wklej treść wiadomości bez zmian i zapisz. Format jest dowolny –
wiadomość odczytuje Claude (`npm run events`, także w każdej synchronizacji; tylko nowe lub zmienione
pliki). Kod sprawdza daty; wątpliwe wydarzenia nie są publikowane i trafiają do `review/pending.md`
oraz powiadomień (decyzja `- event: <id>` w `review/decisions.yaml`). Pominięte zdania (powitanie,
podpis) też są wypisane w `review/pending.md`.

## Jadłospis „Co dziś dobrego?”

Drugi moduł strony (`#/jadlospis`, z datą: `#/jadlospis/2026-11-05`): jadłospis stołówki szkoły
ze [strony stołówki](https://zspzernica.pilchowice.pl/stolowka/) z oznaczeniami alergenów.

```bash
npm run menu              # sprawdzenie (tylko w godzinach z harmonogramu; --force = od razu)
npm run evaluate:menu     # odczyt prawdziwego PDF vs test/golden/jadlospis-2026-11-02.json
```

- Link do PDF jest szukany po tekście „Jadłospis na bieżący tydzień”. PDF jest tylko w pamięci –
  w repozytorium zostają hash, adres i odczytane dane (`data/menu/`).
- Nowy PDF czyta Claude dwa razy (`data/menu/extractions/`); kod normalizuje gramatury, wylicza daty
  (rok z nazwy pliku) i sprawdza wynik. Publikowany jest tylko zgodny i poprawny odczyt:
  `data/menu/<poniedziałek>.json` + `index.json`; stan w `data/menu/status.json`.
- Alergeny są przepisywane tylko z dokumentu – brak numeru nie jest uzupełniany. Słownik 14 alergenów
  jest stały (`web/src/menu.tsx`).
- `.github/workflows/menu.yml`: co godzinę w dni robocze; skrypt sprawdza o 9, 11, 13, 15, 17 i 19
  (czas polski, bez świąt), a gdy jadłospis bieżącego tygodnia już jest – tylko o 9 i 15 (korekty).
  Po zmianie danych sam publikuje stronę.
- Nieudany odczyt nie zmienia danych: problem trafia do `review/jadlospis.md` i do zgłoszenia (issue).
  Ponowny odczyt: usuń `data/menu/extractions/<hash>.*.json`.

## Powiadomienia

Gdy pojawi się pozycja do rozstrzygnięcia dotycząca grup z `publicGroups` (komunikat bez dopasowania,
termin do weryfikacji albo błąd synchronizacji), synchronizacja zakłada zgłoszenie (issue) w repozytorium
z etykietą `do-rozstrzygnięcia` – GitHub wysyła o nim mail. Zgłoszenie zawiera gotowy wpis do
`review/decisions.yaml` i zamyka się samo, gdy pozycja przestanie wymagać decyzji. Wysłane zgłoszenia
są zapisywane w `review/notified.json` (bez powtórek). Działa tylko w GitHub Actions (`GITHUB_TOKEN`).

Komunikaty o zajęciach bez podanej grupy (np. „Słowiki”) trafiają do grup, które mają te zajęcia
w harmonogramie. Komunikat „zaktualizowano tabelę” jest tylko informacją – nowa tabela jest odczytywana
automatycznie.

## Testy i ocena dokładności

```bash
npm test                        # testy dopasowania ogłoszeń (bez AI)
npm run evaluate                # odczyt harmonogramu vs test/golden/2026-10.json
npm run evaluate:announcements  # ogłoszenia vs test/golden/announcements-2026-10.json
```

## Zasady przetwarzania ogłoszeń

- Claude tylko interpretuje tekst (rodzaj zmiany, daty, zajęcia, grupy – tak jak napisano).
- Dopasowanie do terminów robi kod (`src/resolve.ts`) z aliasami z `config/groups.json`
  (np. `kk` → kompetencje kluczowe, `Miki` → Motylki i Wilczki).
- Zmiana jest stosowana tylko przy jednoznacznym dopasowaniu. Nieznana grupa, kilka pasujących zajęć,
  brak terminu w danym dniu lub niejednoznaczne ogłoszenie → **do weryfikacji**, harmonogram bez zmian.
- Do harmonogramu trafiają tylko terminy zgodne w obu przebiegach odczytu.

## Struktura

| Ścieżka | Zawartość |
|---|---|
| `config/groups.json` | Grupy, lokalizacje, aliasy, wykluczone pliki |
| `src/discover.ts` | Monitor strony: WordPress REST API → załączniki i tekst ogłoszeń |
| `src/claude.ts` | Wspólne wywołanie Claude (schemat JSON, bez narzędzi) |
| `src/extract.ts` | Odczyt tabel z obrazów i PDF |
| `src/normalize.ts` | Zamiana komórek na terminy i reguły walidacji (bez AI) |
| `src/schedule.ts` | Harmonogram uzgodniony z obu przebiegów odczytu |
| `src/announcements.ts` | Interpretacja ogłoszeń ze strony |
| `src/resolve.ts` | Dopasowanie zmian do terminów (bez AI) |
| `src/evaluate*.ts` | Ocena dokładności względem wzorców |
| `test/golden/` | Ręcznie przepisane harmonogramy wzorcowe |
| `data/` | Pobrane źródła, odczyty i raporty (wersjonowane w git) |
