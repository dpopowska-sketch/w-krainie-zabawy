// Porównuje odczyt prawdziwego PDF jadłospisu (Claude, 2 przebiegi) ze wzorcem przepisanym ręcznie.
// PDF jest pobierany do pamięci z adresu we wzorcu (albo z pliku podanego w argumencie) i nie jest zapisywany.
// Odczyty trafiają do tego samego cache co synchronizacja (data/menu/extractions/), więc powtórka nic nie kosztuje.
import fs from "node:fs";
import path from "node:path";
import { MENU_HOST, ROOT, readJson } from "./config.js";
import { download, sha256 } from "./discover.js";
import { comparable, firstDifference, readMenu } from "./menu.js";
import type { MenuWeek } from "./published.js";

const golden = readJson<MenuWeek>(path.join(ROOT, "test", "golden", "jadlospis-2026-11-02.json"));

async function main() {
  const local = process.argv[2];
  const pdf = local ? fs.readFileSync(local) : (await download(golden.sourceUrl, MENU_HOST)).data;
  const source = { url: golden.sourceUrl, sha256: sha256(pdf) };
  const { week, problems, cost } = await readMenu(pdf, source, new Date().toISOString());
  console.log(`Koszt: $${cost.toFixed(3)}`);
  if (!week) {
    console.error("Odczyt nie przeszedł walidacji:\n" + problems.map((p) => `- ${p}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  const diff = firstDifference(comparable(week), comparable(golden)) ?? (week.sourceFile !== golden.sourceFile ? `sourceFile: ${week.sourceFile}` : null);
  if (diff) {
    console.error(`Odczyt różni się od wzorca – ${diff}`);
    process.exitCode = 1;
  } else {
    const items = week.days.reduce((n, d) => n + d.meals.sniadanie.items.length + d.meals.obiad.items.length + d.meals.podwieczorek.items.length, 0);
    console.log(`Zgodny ze wzorcem: ${week.days.length} dni, ${items} pozycji.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
