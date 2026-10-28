import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
export const SOURCES_DIR = path.join(DATA_DIR, "sources");
export const EXTRACTIONS_DIR = path.join(DATA_DIR, "extractions");
export const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
export const PAGE_PATH = path.join(DATA_DIR, "page.json");

export const SOURCE_HOST = "przedszkole-zspzernica.pilchowice.pl";
export const SOURCE_PAGE_URL = `https://${SOURCE_HOST}/harmonogram-zajec-w-krainie-zabawy/`;
export const SOURCE_API_URL =
  `https://${SOURCE_HOST}/wp-json/wp/v2/pages?slug=harmonogram-zajec-w-krainie-zabawy` +
  `&_fields=id,link,modified_gmt,content`;

export const USER_AGENT = "w-krainie-zabawy-bot/0.1 (harmonogram dla rodziców)";
export const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

export interface Group {
  id: string;
  name: string;
  aliases: string[];
}

export interface GroupsConfig {
  groups: Group[];
  locations: Record<string, string[]>;
  activityAliases: Record<string, string>;
  /** Wzorce adresów plików, które nie są harmonogramem (np. logotypy). */
  ignoreAttachments: string[];
}

export function loadGroups(): GroupsConfig {
  return readJson<GroupsConfig>(path.join(ROOT, "config", "groups.json"));
}

/** Dopasowuje nagłówek kolumny lub nazwę z ogłoszenia do grupy z konfiguracji. */
export function findGroup(config: GroupsConfig, label: string): Group | undefined {
  const needle = label.trim().toLocaleLowerCase("pl");
  return config.groups.find(
    (g) =>
      g.name.toLocaleLowerCase("pl") === needle ||
      g.aliases.some((a) => a.toLocaleLowerCase("pl") === needle),
  );
}

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function readJsonIfExists<T>(file: string): T | undefined {
  return fs.existsSync(file) ? readJson<T>(file) : undefined;
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

/** Czy ten plik został uruchomiony bezpośrednio (a nie zaimportowany przez inny skrypt). */
export function isMain(importMetaUrl: string): boolean {
  if (!process.argv[1]) return false;
  const norm = (p: string) => path.resolve(p).toLowerCase();
  return norm(process.argv[1]) === norm(fileURLToPath(importMetaUrl));
}

/** Ładuje .env, jeśli istnieje (klucz API nie jest wtedy potrzebny w zmiennych systemowych). */
export function loadEnv(): void {
  if (fs.existsSync(path.join(ROOT, ".env"))) process.loadEnvFile(path.join(ROOT, ".env"));
}
