// Powiadomienia o pozycjach do rozstrzygnięcia jako zgłoszenia (issues) w repozytorium GitHub.
// GitHub sam wysyła o nich maile. Tylko grupy z publicGroups, każda pozycja raz;
// zgłoszenie zamyka się samo, gdy pozycja zniknie z listy do weryfikacji.
import path from "node:path";
import { ROOT, SOURCE_PAGE_URL, readJsonIfExists, writeJson } from "./config.js";
import type { PublishedSchedule } from "./published.js";

export const NOTIFIED_PATH = path.join(ROOT, "review", "notified.json");
const LABEL = "do-rozstrzygnięcia";

export interface NotifyItem {
  key: string;
  title: string;
  body: string;
}

/** Wysłane powiadomienia: klucz pozycji → numer zgłoszenia. */
type NotifiedState = Record<string, { issue: number; title: string }>;

/** Dzisiejsza data (YYYY-MM-DD) w strefie Europe/Warsaw. */
function todayWarsaw(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
}

function decisionHint(repo: string | null, yaml: string[]): string[] {
  return [
    "Aby rozstrzygnąć, dopisz do `review/decisions.yaml`" + (repo ? ` ([edytuj w przeglądarce](https://github.com/${repo}/edit/main/review/decisions.yaml))` : "") + ":",
    "",
    "```yaml",
    ...yaml,
    "```",
    "",
    "Zgłoszenie zamknie się samo po zapisaniu decyzji.",
  ];
}

/** Pozycje do rozstrzygnięcia dotyczące widocznych grup. Minione terminy pomijamy. */
export function collectItems(
  schedule: PublishedSchedule,
  errors: string[],
  publicGroups: string[],
  repo: string | null,
  today = todayWarsaw(),
): NotifyItem[] {
  const name = (id: string) => schedule.groups.find((g) => g.id === id)?.name ?? id;
  const items: NotifyItem[] = [];

  for (const n of schedule.notices) {
    if (n.kind !== "review" || n.removedAt) continue;
    if (n.groups !== "all" && !n.groups.some((g) => publicGroups.includes(g))) continue;
    if (n.dates.length > 0 && n.dates.every((d) => d < today)) continue;
    items.push({
      key: `notice:${n.id}`,
      title: `Do rozstrzygnięcia: ${n.text.slice(0, 90)}`,
      body: [
        `**Komunikat przedszkola:** ${n.text}`,
        "",
        `- Grupy: ${n.groups === "all" ? "nie udało się ustalić (wszystkie)" : n.groups.map(name).join(", ")}`,
        `- Powód: ${n.reason}`,
        `- [Strona przedszkola](${SOURCE_PAGE_URL})`,
        "",
        ...decisionHint(repo, [`  - notice: ${n.id}`, "    action: dismiss   # ukryj komunikat"]),
      ].join("\n"),
    });
  }

  for (const a of schedule.activities) {
    if (a.verification !== "needs_review" || !publicGroups.includes(a.group) || a.date < today) continue;
    items.push({
      key: `activity:${a.id}`,
      title: `Do rozstrzygnięcia: ${a.date} ${a.start ?? "?"} · ${name(a.group)} · ${a.activity.slice(0, 60)}`,
      body: [
        `**Termin:** ${a.date} ${a.start ?? "?"}–${a.end ?? "?"} · ${name(a.group)} · ${a.activity}`,
        "",
        ...a.reviewReasons.map((r) => `- Powód: ${r}`),
        ...a.sources.map((s) =>
          s.type === "schedule" ? `- Tabela: „${s.cellText ?? ""}” ([plik](${s.url}))` : s.type === "announcement" ? `- Ogłoszenie: „${s.text}”` : "- Decyzja ręczna",
        ),
        "",
        ...decisionHint(repo, [`  - id: ${a.id}`, "    action: confirm   # albo: hide / edit (z polem set)"]),
      ].join("\n"),
    });
  }

  // Jedno zgłoszenie na cały okres błędów – zamyka się po pierwszej udanej synchronizacji.
  if (errors.length) {
    items.push({
      key: "sync-errors",
      title: "Synchronizacja harmonogramu nie powiodła się",
      body: [
        "Ostatnia synchronizacja zakończyła się błędem. Strona pokazuje ostatnie sprawdzone dane z ostrzeżeniem dla rodziców.",
        "",
        ...errors.map((e) => `- ${e}`),
        "",
        "Zgłoszenie zamknie się samo po pierwszej udanej synchronizacji.",
      ].join("\n"),
    });
  }
  return items;
}

export interface GitHubOptions {
  repo: string;
  token: string;
  fetch?: typeof fetch;
  statePath?: string;
}

/** Zakłada zgłoszenia dla nowych pozycji i zamyka te, które przestały wymagać decyzji. */
export async function notify(items: NotifyItem[], opts: GitHubOptions): Promise<{ opened: number; closed: number }> {
  const doFetch = opts.fetch ?? fetch;
  const statePath = opts.statePath ?? NOTIFIED_PATH;
  const state = readJsonIfExists<NotifiedState>(statePath) ?? {};

  const api = async (method: string, url: string, body: unknown) => {
    const res = await doFetch(`https://api.github.com/repos/${opts.repo}${url}`, {
      method,
      headers: {
        Authorization: `Bearer ${opts.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GitHub ${method} ${url}: ${res.status} ${await res.text()}`);
    return (await res.json()) as { number: number };
  };

  let opened = 0;
  let closed = 0;
  // Stan zapisujemy po każdym kroku, żeby błąd w połowie nie powodował duplikatów.
  try {
    for (const item of items) {
      if (state[item.key]) continue;
      const issue = await api("POST", "/issues", { title: item.title, body: item.body, labels: [LABEL] });
      state[item.key] = { issue: issue.number, title: item.title };
      writeJson(statePath, state);
      opened++;
    }
    const current = new Set(items.map((i) => i.key));
    for (const [key, { issue }] of Object.entries(state)) {
      if (current.has(key)) continue;
      const comment = key === "sync-errors" ? "Synchronizacja znów działa." : "Pozycja nie wymaga już decyzji (zapisana decyzja, zmiana na stronie przedszkola albo termin minął).";
      await api("POST", `/issues/${issue}/comments`, { body: comment });
      await api("PATCH", `/issues/${issue}`, { state: "closed", state_reason: "completed" });
      delete state[key];
      writeJson(statePath, state);
      closed++;
    }
  } finally {
    writeJson(statePath, state);
  }
  return { opened, closed };
}
