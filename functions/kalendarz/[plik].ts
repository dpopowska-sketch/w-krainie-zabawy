// Funkcja Cloudflare Pages: /kalendarz/wilczki.ics – subskrypcja „Kalendarz w telefonie”.
// Bez parametru wszystkie zajęcia grupy, z ?moje=kod.kod tylko wybrane. Dane: data/calendar.json
// opublikowany razem ze stroną, więc kalendarz zmienia się przy każdej publikacji.
import type { CalendarData } from "../../src/published.js";
import { feedText } from "../../web/src/feed.js";

interface Context {
  request: Request;
  params: { plik?: string | string[] };
  env: { ASSETS: { fetch(input: string): Promise<Response> } };
}

export async function onRequestGet({ request, params, env }: Context): Promise<Response> {
  const match = /^([a-z0-9-]+)\.ics$/.exec(String(params.plik ?? ""));
  if (!match) return new Response("Nie ma takiego kalendarza.", { status: 404 });

  const res = await env.ASSETS.fetch(new URL("/data/calendar.json", request.url).toString());
  if (!res.ok) return new Response("Dane kalendarza są chwilowo niedostępne.", { status: 503 });

  const moje = new URL(request.url).searchParams.get("moje");
  const text = feedText((await res.json()) as CalendarData, {
    group: match[1]!,
    codes: moje ? moje.split(".").filter(Boolean) : null,
  });
  if (!text) return new Response("Nie ma takiego kalendarza.", { status: 404 });

  return new Response(text, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${match[1]}.ics"`,
      // Telefony i tak sprawdzają co godzinę lub rzadziej; 15 minut odciąża funkcję.
      "Cache-Control": "public, max-age=900",
    },
  });
}
