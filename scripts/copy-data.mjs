// Kopiuje dane dla strony do web/public/data (przed uruchomieniem i budowaniem strony).
import fs from "node:fs";

fs.mkdirSync("web/public/data", { recursive: true });
for (const [from, to] of [
  ["data/published/schedule.json", "web/public/data/schedule.json"],
  ["data/status.json", "web/public/data/status.json"],
]) {
  if (fs.existsSync(from)) fs.copyFileSync(from, to);
  else console.warn(`Brak ${from} – uruchom najpierw npm run sync`);
}
