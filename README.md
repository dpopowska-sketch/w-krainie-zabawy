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

## Automatyczna synchronizacja

`.github/workflows/sync.yml` uruchamia `npm run sync` w GitHub Actions dwa razy dziennie
(ok. 5:15 i 15:15 zimą, 6:15 i 16:15 latem), po każdej zapisanej decyzji oraz ręcznie
(zakładka **Actions** → **Synchronizacja harmonogramu** → **Run workflow**).
Wymaga sekretu `ANTHROPIC_API_KEY` w ustawieniach repozytorium.

Zmiany danych są zapisywane w repozytorium od razu; sam czas sprawdzenia – raz dziennie.

## Weryfikacja ręczna

- `review/pending.md` – lista pozycji do sprawdzenia (generowana automatycznie).
- `review/decisions.yaml` – Twoje decyzje: `confirm`, `hide`, `edit`, `dismiss`.

Gdy strona przedszkola jest niedostępna albo odczyt się nie powiedzie, dane nie są
usuwane ani nadpisywane – błąd trafia do `data/status.json`.

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
