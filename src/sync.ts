// Pełna synchronizacja: strona → odczyt nowych plików → ogłoszenia → plik dla strony.
// Błąd jednego kroku nie usuwa danych: publikujemy ostatni zweryfikowany stan
// i zapisujemy problem w data/status.json.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { interpretNewLines } from "./announcements.js";
import { PUBLISHED_PATH, build } from "./build.js";
import { DATA_DIR, loadGroups, readJsonIfExists, writeJson } from "./config.js";
import { discover } from "./discover.js";
import { extractAll } from "./extract.js";
import { collectItems, notify } from "./notify.js";
import type { SyncStatus } from "./published.js";
import { loadConsensus } from "./schedule.js";

export const STATUS_PATH = path.join(DATA_DIR, "status.json");

function fileHash(file: string): string | null {
  return fs.existsSync(file) ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null;
}

export async function sync(): Promise<SyncStatus> {
  const now = new Date().toISOString();
  const previous = readJsonIfExists<SyncStatus>(STATUS_PATH);
  const before = fileHash(PUBLISHED_PATH);
  const errors: string[] = [];
  let cost = 0;

  try {
    const result = await discover();
    console.log(result.log.join("\n"));
    errors.push(...result.errors);
  } catch (err) {
    errors.push(`Strona przedszkola niedostępna: ${err instanceof Error ? err.message : String(err)}`);
  }

  const extraction = await extractAll();
  errors.push(...extraction.errors);
  cost += extraction.cost;

  try {
    const { period } = loadConsensus();
    if (period) {
      const result = await interpretNewLines(period);
      cost += result.cost;
    }
  } catch (err) {
    errors.push(`Interpretacja ogłoszeń nie powiodła się: ${err instanceof Error ? err.message : String(err)}`);
  }

  const { schedule, problems } = build();
  errors.push(...problems);

  const changed = fileHash(PUBLISHED_PATH) !== before;
  const status: SyncStatus = {
    lastChecked: now,
    lastSuccess: errors.length === 0 ? now : (previous?.lastSuccess ?? null),
    lastDataChange: changed ? now : (previous?.lastDataChange ?? now),
    errors,
  };
  writeJson(STATUS_PATH, status);

  const review = schedule.activities.filter((a) => a.verification === "needs_review").length;
  console.log(
    `\nTerminów: ${schedule.activities.length}, do weryfikacji: ${review}, komunikatów: ${schedule.notices.length}. ` +
      `Dane ${changed ? "ZMIENIONE" : "bez zmian"}. Koszt AI: $${cost.toFixed(3)}`,
  );
  for (const e of errors) console.error(`BŁĄD: ${e}`);

  // Błąd powiadomień nie jest błędem synchronizacji – rodzice nie powinni widzieć z tego powodu ostrzeżenia.
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (token && repo) {
    try {
      const items = collectItems(schedule, errors, loadGroups().publicGroups, repo);
      const { opened, closed } = await notify(items, { repo, token });
      console.log(`Powiadomienia: ${items.length} do rozstrzygnięcia, nowe zgłoszenia: ${opened}, zamknięte: ${closed}`);
    } catch (err) {
      console.error(`::warning::Powiadomienia nie powiodły się: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    console.log("Powiadomienia pominięte (brak GITHUB_TOKEN lub GITHUB_REPOSITORY – działają w GitHub Actions).");
  }
  return status;
}

sync().then((status) => {
  if (status.errors.length) process.exitCode = 1;
});
