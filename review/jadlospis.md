# Jadłospis – do sprawdzenia

Plik generowany automatycznie przy sprawdzaniu jadłospisu (`npm run menu`).

Ostatni odczyt (2026-11-09T10:45:39.426Z) nie został opublikowany – strona pokazuje poprzednie dane.

- Odczyt a: Model zgłosił wątpliwość: Wiersz 'Środa' ma puste komórki bez żadnego tekstu (brak informacji typu 'Dzień wolny'), więc closed_text pozostawiono jako null, a posiłki puste.
- Odczyt b: Model zgłosił wątpliwość: Wiersz 'Środa' ma puste komórki we wszystkich posiłkach, bez żadnego tekstu wyjaśniającego (np. 'Dzień wolny'), dlatego closed_text = null, a posiłki są puste – nie wiadomo, czy to dzień bez posiłków, czy brak danych.

Dokument: https://zspzernica.pilchowice.pl/wp-content/uploads/2026/11/Jadlospis-09_11_13_11-26r-1.pdf

Co zrobić: sprawdź PDF na stronie stołówki. Jeśli odczyt był błędny, usuń pliki
`data/menu/extractions/5932e7ab860653b4e682679f0f4a8d6ca279ed828f99d5d2445bea8cec35c4f3.*.json` – przy następnym sprawdzeniu PDF zostanie odczytany ponownie.
