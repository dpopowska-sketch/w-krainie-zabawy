# Do weryfikacji

Plik generowany automatycznie przy każdej synchronizacji – nie edytuj go.
Decyzje wpisuj w `review/decisions.yaml` (instrukcja na górze tamtego pliku).

## Terminy (3)

### 2026-10-06 07:30–08:30 · Motylki · Zajęcia rozwijające kompetencje kluczowe z wykorzystaniem robotyki i programowania

- Status: odwołane, prowadzi J. Bieniek
- Powód: Dzień tygodnia w tabeli nie pasuje do daty
- Tabela: „Poniedziałek 7.30 – 8.30 06.10; 12.10; 20.10; 27.10;” ([plik](https://przedszkole-zspzernica.pilchowice.pl/wordpress/wp-content/uploads/2026/10/a26fad0e-f685-42c6-96cd-326d842f621f-0-scaled.jpg))
- Ogłoszenie: „– 6.10.2026 r. – odwołane zajęcia z kk – grupa Miki”

```yaml
  - id: 9e36dd198f26
    action: confirm   # albo: hide / edit (z polem set)
```

### 2026-10-20 07:30–08:30 · Motylki · Zajęcia rozwijające kompetencje kluczowe z wykorzystaniem robotyki i programowania

- Status: zaplanowane, prowadzi J. Bieniek
- Powód: Dzień tygodnia w tabeli nie pasuje do daty
- Tabela: „Poniedziałek 7.30 – 8.30 06.10; 12.10; 20.10; 27.10;” ([plik](https://przedszkole-zspzernica.pilchowice.pl/wordpress/wp-content/uploads/2026/10/a26fad0e-f685-42c6-96cd-326d842f621f-0-scaled.jpg))

```yaml
  - id: ffaaf3302377
    action: confirm   # albo: hide / edit (z polem set)
```

### 2026-10-27 07:30–08:30 · Motylki · Zajęcia rozwijające kompetencje kluczowe z wykorzystaniem robotyki i programowania

- Status: zaplanowane, prowadzi J. Bieniek
- Powód: Dzień tygodnia w tabeli nie pasuje do daty
- Tabela: „Poniedziałek 7.30 – 8.30 06.10; 12.10; 20.10; 27.10;” ([plik](https://przedszkole-zspzernica.pilchowice.pl/wordpress/wp-content/uploads/2026/10/a26fad0e-f685-42c6-96cd-326d842f621f-0-scaled.jpg))

```yaml
  - id: d45b988a2130
    action: confirm   # albo: hide / edit (z polem set)
```

## Komunikaty bez dopasowania (1)

Pokazywane rodzicom jako tekst ogłoszenia, bez zmiany statusu terminów.

### „5.10.2026 r. – odwołane zajęcia z preorientacji zawodowej – Sówki”

- Grupy: Sówki
- Powód: Brak terminu „Zajęcia z preorientacji zawodowej” w dniu 2026-10-05 w harmonogramie

```yaml
  - notice: 8fb045778dce
    action: dismiss   # ukryj komunikat
```
