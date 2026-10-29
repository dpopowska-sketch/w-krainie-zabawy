// Pobiera stronę źródłową przez WordPress REST API, wykrywa załączniki
// z harmonogramem, pobiera ich oryginały i aktualizuje manifest.
// Nie usuwa niczego: zniknięcie pliku ze strony jest tylko oznaczane.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import {
  MANIFEST_PATH,
  MAX_DOWNLOAD_BYTES,
  PAGE_PATH,
  SOURCE_API_URL,
  SOURCE_HOST,
  SOURCE_PAGE_URL,
  SOURCES_DIR,
  USER_AGENT,
  isMain,
  loadGroups,
  readJsonIfExists,
  writeJson,
} from "./config.js";

export interface SourceDocument {
  /** Adres oryginału (bez końcówki -1024x724), klucz dokumentu. */
  url: string;
  /** Adres, pod którym plik jest osadzony na stronie (miniatura / link). */
  pageUrls: string[];
  sha256: string;
  bytes: number;
  contentType: string;
  file: string;
  lastModifiedHeader: string | null;
  firstSeen: string;
  removedAt: string | null;
  /** Poprzednie wersje pliku pod tym samym adresem. */
  history: { sha256: string; file: string; firstSeen: string; replacedAt: string }[];
}

/**
 * Manifest zmienia się tylko przy prawdziwej zmianie źródła (nowy/zmieniony/usunięty plik,
 * zmieniona treść strony). Czas sprawdzenia jest w data/status.json, żeby codzienne
 * sprawdzenia bez zmian nie tworzyły zmian w historii git.
 */
export interface Manifest {
  page: { id: number; link: string; modifiedGmt: string; contentSha256: string } | null;
  documents: SourceDocument[];
}

export interface DiscoverResult {
  manifest: Manifest;
  /** Problemy, które nie przerwały sprawdzania (np. jeden plik się nie pobrał). */
  errors: string[];
  log: string[];
}

const ATTACHMENT_EXT = /\.(jpe?g|png|pdf)$/i;
const RESIZED_SUFFIX = /-\d+x\d+(?=\.(jpe?g|png)$)/i;
const ALLOWED_TYPES = /^(image\/(jpeg|png)|application\/pdf)\b/i;

function sha256(data: Buffer | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function isSourceUpload(url: URL): boolean {
  return url.hostname === SOURCE_HOST && url.pathname.includes("/wp-content/uploads/") && ATTACHMENT_EXT.test(url.pathname);
}

/**
 * Strona jest budowana w WPBakery, a REST API zwraca surowe shortcody, np.
 * [vc_gallery images="17007,17008,17009"]. Zbieramy identyfikatory załączników
 * i zamieniamy je na adresy plików przez /wp-json/wp/v2/media/{id}.
 */
function findShortcodeMediaIds(html: string): number[] {
  const text = cheerio.load(html).text();
  const ids = new Set<number>();
  for (const m of text.matchAll(/\[vc_[a-z_]+[^\]]*?\bimages?=\D*?([\d][\d,\s]*)/g)) {
    for (const id of m[1]!.split(",")) if (id.trim()) ids.add(Number(id.trim()));
  }
  return [...ids];
}

async function resolveMedia(id: number): Promise<string> {
  const res = await fetchChecked(`https://${SOURCE_HOST}/wp-json/wp/v2/media/${id}?_fields=id,source_url`);
  const media = (await res.json()) as { source_url?: string };
  if (!media.source_url) throw new Error(`Brak adresu pliku dla załącznika ${id}`);
  return new URL(media.source_url).href;
}

/** Zwraca listę załączników z treści strony: adres pliku → adresy/identyfikatory użyte na stronie. */
async function findAttachments(html: string, ignore: RegExp[], log: string[]): Promise<Map<string, Set<string>>> {
  const $ = cheerio.load(html);
  const found = new Map<string, Set<string>>();
  const add = (fileUrl: string, ref: string) => {
    if (ignore.some((re) => re.test(fileUrl))) return;
    if (!found.has(fileUrl)) found.set(fileUrl, new Set());
    found.get(fileUrl)!.add(ref);
  };

  for (const id of findShortcodeMediaIds(html)) {
    try {
      const url = await resolveMedia(id);
      if (isSourceUpload(new URL(url))) add(url, `media:${id}`);
    } catch (err) {
      log.push(`BŁĄD odczytu załącznika ${id}: ${String(err)}`);
    }
  }

  $("a[href], img[src]").each((_, el) => {
    const raw = $(el).attr("href") ?? $(el).attr("src");
    if (!raw) return;
    let url: URL;
    try {
      url = new URL(raw, SOURCE_PAGE_URL);
    } catch {
      return;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    url.protocol = "https:";
    if (!isSourceUpload(url)) return;
    add(url.href.replace(RESIZED_SUFFIX, ""), url.href);
  });
  return found;
}

/** Tekst strony podzielony na linie – z tego później wyciągamy ogłoszenia o zmianach. */
function extractTextLines(html: string): string[] {
  const $ = cheerio.load(html);
  $("script, style").remove();
  $("br").replaceWith("\n");
  const lines: string[] = [];
  $("p, li, h1, h2, h3, h4, h5, h6, td, th").each((_, el) => {
    if ($(el).find("p, li").length > 0) return; // tylko elementy liściowe, bez powtórzeń
    for (const line of $(el).text().replace(/\[\/?vc_[^\]]*\]/g, "\n").split(/\n+/)) {
      const clean = line.replace(/\s+/g, " ").trim();
      if (clean) lines.push(clean);
    }
  });
  return lines;
}

async function fetchChecked(url: string): Promise<Response> {
  if (new URL(url).hostname !== SOURCE_HOST) throw new Error(`Niedozwolona domena: ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "error" });
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  return res;
}

async function download(url: string): Promise<{ data: Buffer; contentType: string; lastModified: string | null }> {
  const res = await fetchChecked(url);
  const contentType = res.headers.get("content-type") ?? "";
  if (!ALLOWED_TYPES.test(contentType)) throw new Error(`Nieobsługiwany typ pliku ${contentType} dla ${url}`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_DOWNLOAD_BYTES) throw new Error(`Plik za duży (${length} B): ${url}`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > MAX_DOWNLOAD_BYTES) throw new Error(`Plik za duży (${data.length} B): ${url}`);
  return { data, contentType: contentType.split(";")[0]!.trim(), lastModified: res.headers.get("last-modified") };
}

/**
 * Sprawdza stronę i aktualizuje manifest. Rzuca wyjątek, gdy strona jest niedostępna –
 * wtedy niczego nie zapisuje (zostają ostatnie zweryfikowane dane).
 */
export async function discover(): Promise<DiscoverResult> {
  const now = new Date().toISOString();
  const manifest: Manifest = readJsonIfExists<Manifest>(MANIFEST_PATH) ?? { page: null, documents: [] };
  const errors: string[] = [];

  const res = await fetchChecked(SOURCE_API_URL);
  const pages = (await res.json()) as { id: number; link: string; modified_gmt: string; content: { rendered: string } }[];
  const page = pages[0];
  if (!page) throw new Error("API nie zwróciło strony harmonogramu");
  const html = page.content.rendered;

  const contentSha256 = sha256(html);
  const pageChanged = manifest.page?.contentSha256 !== contentSha256;
  manifest.page = { id: page.id, link: page.link, modifiedGmt: page.modified_gmt, contentSha256 };
  writeJson(PAGE_PATH, { modifiedGmt: page.modified_gmt, contentSha256, lines: extractTextLines(html) });
  fs.mkdirSync(path.join(SOURCES_DIR, "page"), { recursive: true });
  fs.writeFileSync(path.join(SOURCES_DIR, "page", `${contentSha256}.html`), html, "utf8");

  const log: string[] = [pageChanged ? "Treść strony: ZMIENIONA" : "Treść strony: bez zmian"];
  const ignore = loadGroups().ignoreAttachments.map((p) => new RegExp(p, "i"));
  const attachments = await findAttachments(html, ignore, errors);
  fs.mkdirSync(SOURCES_DIR, { recursive: true });
  {

    for (const [original, pageUrls] of attachments) {
      // Oryginał może nie istnieć (np. wgrany od razu w małym rozmiarze) – wtedy bierzemy największy wariant ze strony.
      const candidates = [original, ...[...pageUrls].filter((u) => u.startsWith("https://") && u !== original)];
      let downloaded: Awaited<ReturnType<typeof download>> | undefined;
      let lastErr: unknown;
      for (const candidate of candidates) {
        try {
          downloaded = await download(candidate);
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (!downloaded) {
        errors.push(`Nie udało się pobrać ${original}: ${String(lastErr)}`);
        continue;
      }

      const hash = sha256(downloaded.data);
      const ext = path.extname(new URL(original).pathname).toLowerCase();
      const file = `sources/${hash}${ext}`;
      fs.writeFileSync(path.join(SOURCES_DIR, `${hash}${ext}`), downloaded.data);

      const existing = manifest.documents.find((d) => d.url === original);
      if (!existing) {
        manifest.documents.push({
          url: original,
          pageUrls: [...pageUrls],
          sha256: hash,
          bytes: downloaded.data.length,
          contentType: downloaded.contentType,
          file,
          lastModifiedHeader: downloaded.lastModified,
          firstSeen: now,
          removedAt: null,
          history: [],
        });
        log.push(`NOWY plik: ${original}`);
      } else if (existing.sha256 !== hash) {
        existing.history.push({ sha256: existing.sha256, file: existing.file, firstSeen: existing.firstSeen, replacedAt: now });
        Object.assign(existing, { sha256: hash, file, bytes: downloaded.data.length, firstSeen: now, removedAt: null });
        existing.lastModifiedHeader = downloaded.lastModified;
        existing.pageUrls = [...pageUrls];
        log.push(`ZMIENIONA treść pliku (ten sam adres): ${original}`);
      } else {
        if (existing.removedAt) log.push(`Plik wrócił na stronę: ${original}`);
        existing.removedAt = null;
        existing.pageUrls = [...pageUrls];
      }
    }
  }

  // Plik uznajemy za usunięty tylko wtedy, gdy lista załączników jest pełna.
  // Jeśli choć jeden załącznik nie dał się odczytać, nie wiemy, czy coś zniknęło.
  if (errors.length === 0) {
    for (const doc of manifest.documents) {
      if (!attachments.has(doc.url) && doc.removedAt === null) {
        doc.removedAt = now;
        log.push(`USUNIĘTY ze strony (dane zostają): ${doc.url}`);
      }
    }
  }

  writeJson(MANIFEST_PATH, manifest);
  log.push(`Załączniki na stronie: ${attachments.size}, dokumentów w manifeście: ${manifest.documents.length}`);
  return { manifest, errors, log };
}

if (isMain(import.meta.url)) {
  discover().then(({ log, errors }) => {
    console.log([...log, ...errors.map((e) => `BŁĄD: ${e}`)].join("\n"));
  }).catch((err) => {
    console.error("Synchronizacja nie powiodła się:", err);
    process.exitCode = 1;
  });
}
