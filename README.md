# W krainie zabawy – harmonogram zajęć

Harmonogram zajęć dodatkowych projektu „W krainie zabawy” (Słoneczne Przedszkole w Żernicy),
pobierany automatycznie ze [strony przedszkola](https://przedszkole-zspzernica.pilchowice.pl/harmonogram-zajec-w-krainie-zabawy/).

## Etap M0 – test odczytu harmonogramów

```bash
npm install
cp .env.example .env      # i wpisz ANTHROPIC_API_KEY

npm run discover          # pobiera stronę i załączniki → data/manifest.json, data/page.json
npm run extract           # odczyt obrazów przez Claude (2 przebiegi) → data/extractions/
npm run evaluate          # porównanie ze wzorcem test/golden/2026-10.json → data/m0-report.json
```

`extract` odczytuje tylko pliki, których jeszcze nie czytał (cache po hashu pliku),
więc ponowne uruchomienie nic nie kosztuje.

## Struktura

| Ścieżka | Zawartość |
|---|---|
| `config/groups.json` | Grupy, lokalizacje, aliasy, wykluczone pliki |
| `src/discover.ts` | Monitor strony: WordPress REST API → załączniki i tekst ogłoszeń |
| `src/extract.ts` | Odczyt tabel przez Claude ze ścisłym schematem JSON |
| `src/normalize.ts` | Zamiana komórek na terminy i reguły walidacji (bez AI) |
| `src/evaluate.ts` | Ocena dokładności względem wzorca |
| `test/golden/` | Ręcznie przepisane harmonogramy wzorcowe |
| `data/` | Pobrane źródła, odczyty i raporty (wersjonowane w git) |
