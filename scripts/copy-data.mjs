// Kopiuje dane dla strony do web/public/data (przed uruchomieniem i budowaniem strony).
import fs from "node:fs";

fs.mkdirSync("web/public/data", { recursive: true });
for (const [from, to] of [
  ["data/published/schedule.json", "web/public/data/schedule.json"],
  ["data/published/calendar.json", "web/public/data/calendar.json"],
  ["data/status.json", "web/public/data/status.json"],
]) {
  if (fs.existsSync(from)) fs.copyFileSync(from, to);
  else console.warn(`Brak ${from} – uruchom najpierw npm run sync`);
}

// Jadłospis: pliki tygodni, index.json i status.json (bez odczytów modelu z extractions/).
fs.rmSync("web/public/data/menu", { recursive: true, force: true });
if (fs.existsSync("data/menu")) {
  fs.mkdirSync("web/public/data/menu", { recursive: true });
  for (const file of fs.readdirSync("data/menu")) {
    if (file.endsWith(".json")) fs.copyFileSync(`data/menu/${file}`, `web/public/data/menu/${file}`);
  }
} else {
  console.warn("Brak data/menu – uruchom najpierw npm run menu");
}
