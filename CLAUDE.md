# Zasady pracy dla Claude

Najpierw przeczytaj `README.md`: opisuje cały przepływ danych, pliki i decyzje ręczne.

## O projekcie

„Plan przedszkolaka – grupa Wilczki” to publiczna strona dla rodziców. Pokazuje harmonogram zajęć
dodatkowych „W krainie zabawy” ze [strony przedszkola](https://przedszkole-zspzernica.pilchowice.pl/harmonogram-zajec-w-krainie-zabawy/),
wydarzenia grupy i jadłospis („Co dziś dobrego?”, ze stołówki szkoły: zspzernica.pilchowice.pl/stolowka).

- Strona: https://wilczki-kalendarz.pages.dev (Cloudflare Pages) i równolegle, w okresie próbnym,
  https://dpopowska-sketch.github.io/w-krainie-zabawy/ (GitHub Pages).
- Stos: TypeScript, Node (`tsx`), Vite + Preact w `web/`, funkcje Cloudflare w `functions/`, testy `node:test`.
- Publikowana jest tylko grupa **Wilczki** (`config/groups.json` → `publicGroups`).
- „Słowiki” to **zajęcia** (śpiew), nie grupa. „Miki” to lokalizacja (Motylki + Wilczki).

## Założenia, których nie zmieniamy bez pytania

- **AI tylko interpretuje tekst, kod decyduje.** Claude odczytuje tabele i ogłoszenia, a dopasowanie do
  terminów robi kod (`src/resolve.ts`). Przy niejednoznaczności zmiana trafia „do weryfikacji”
  (`review/pending.md` + zgłoszenie GitHub), a harmonogram zostaje bez zmian. Nie zgadujemy.
- Do harmonogramu trafiają tylko terminy zgodne w obu przebiegach odczytu.
- Gdy źródło jest niedostępne albo odczyt się nie powiedzie, dane nie są usuwane ani nadpisywane.
- Decyzje ręczne zapisuje się w `review/decisions.yaml`. Plik `review/pending.md` jest generowany, nie edytuj go ręcznie.
- Strona ma dwa wyglądy: **Ciepły i przyjazny** (domyślny, `przyjazny`) i **Nowoczesny minimalistyczny**
  (`nowoczesny`). Każda zmiana interfejsu musi działać w obu wyglądach i na telefonie (szerokość 390 px).
- Teksty dla rodziców piszemy prostą polszczyzną, bez żargonu technicznego.

## Jak pracujemy

- Odpowiadaj po polsku. Opisuj skutki zmian dla rodziców, nie szczegóły kodu.
- **Każdy push do `main` od razu publikuje stronę dla rodziców.** Pracuj na osobnej gałęzi i otwieraj
  pull request. Na `main` wysyłaj tylko na wyraźną prośbę (u nas „wysłać” oznacza: commit + push na `main`).
- Przed oddaniem pracy uruchom: `npm run typecheck`, `npm test`, `npm run web:build`.
- **Scalanie pull requesta do `main`:**
  - tylko po komentarzu, który wprost akceptuje tę zmianę (np. „akceptuję, scal”). Pytanie, uwaga albo
    prośba o poprawkę to nie akceptacja;
  - tylko gdy sprawdzenie „Sprawdzenie zmian” (`.github/workflows/check.yml`) na tym pull requeście
    zakończyło się sukcesem. Gdy trwa – poczekaj; gdy się nie powiodło albo go nie ma – nie scalaj,
    tylko napisz, co nie przeszło;
  - po scaleniu napisz, co zobaczą rodzice i co warto obejrzeć na stronie.
- Zmiany wyglądu sprawdzaj w przeglądarce w obu wyglądach i w szerokości telefonu, jeśli masz taką
  możliwość. Jeśli nie – napisz wprost, że wyglądu nie oglądano.
- **Nie uruchamiaj** `npm run sync`, `extract`, `announcements`, `events` ani `menu` bez potrzeby:
  wywołują płatne API Claude i zapisują dane. Do zmian w wyglądzie wystarczy `npm run web:dev`
  na danych z repozytorium.
- Nie zmieniaj pobierania ani dopasowywania (`src/discover.ts`, `src/announcements.ts`, `src/resolve.ts`),
  gdy zadanie dotyczy tylko wyświetlania.
- Synchronizacja (`.github/workflows/sync.yml`) działa co godzinę od 7:00 do 17:00 czasu polskiego
  i po każdym pushu do `main`. Jadłospis ma osobny `menu.yml`.

## Otwarte sprawy (stan na 9.11.2026)

- Okres próbny dwóch hostingów. Po akceptacji: usunąć kroki GitHub Pages i `continue-on-error`
  przy Cloudflare, zaktualizować README, a repozytorium stanie się prywatne.
- Do rozważenia: żeby `sync.yml` i `menu.yml` nie publikowały strony w tym samym momencie.
