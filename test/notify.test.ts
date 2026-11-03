// Testy powiadomień – bez sieci, z podstawionym fetch.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { collectItems, notify } from "../src/notify.js";
import type { Notice, PublishedActivity, PublishedSchedule } from "../src/published.js";

function notice(partial: Partial<Notice>): Notice {
  return { id: "n1", kind: "review", text: "komunikat", groups: "all", dates: [], reason: "?", firstSeen: "2026-11-01", removedAt: null, ...partial };
}

function activity(partial: Partial<PublishedActivity>): PublishedActivity {
  return {
    id: "a1",
    group: "wilczki",
    activity: "Słowiki",
    teacher: null,
    date: "2026-11-20",
    start: "12:45",
    end: "13:45",
    location: null,
    subgroup: null,
    status: "scheduled",
    previous: null,
    verification: "needs_review",
    reviewReasons: ["powód"],
    warnings: [],
    sources: [],
    updatedAt: "2026-11-01",
    ...partial,
  };
}

function schedule(notices: Notice[], activities: PublishedActivity[] = []): PublishedSchedule {
  return { sourcePage: "", groups: [{ id: "wilczki", name: "Wilczki" }, { id: "sowki", name: "Sówki" }], activities, notices };
}

const TODAY = "2026-11-04";

test("tylko widoczne grupy, bez informacji, usuniętych i minionych", () => {
  const items = collectItems(
    schedule(
      [
        notice({ id: "wszyscy" }),
        notice({ id: "wilczki", groups: ["wilczki", "sowki"] }),
        notice({ id: "sowki", groups: ["sowki"] }),
        notice({ id: "info", kind: "info" }),
        notice({ id: "usuniety", removedAt: "2026-11-02" }),
        notice({ id: "miniony", dates: ["2026-11-01"] }),
      ],
      [activity({ id: "ok" }), activity({ id: "inna", group: "sowki" }), activity({ id: "stary", date: "2026-11-01" }), activity({ id: "spr", verification: "verified" })],
    ),
    [],
    ["wilczki"],
    "o/r",
    TODAY,
  );
  assert.deepEqual(items.map((i) => i.key), ["notice:wszyscy", "notice:wilczki", "activity:ok"]);
});

test("błędy synchronizacji → jedno zgłoszenie", () => {
  const items = collectItems(schedule([]), ["a", "b"], ["wilczki"], null, TODAY);
  assert.deepEqual(items.map((i) => i.key), ["sync-errors"]);
});

test("nowe → zgłoszenie, powtórka → nic, rozstrzygnięte → zamknięcie", async () => {
  const statePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "notify-")), "notified.json");
  const calls: string[] = [];
  let next = 1;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push(`${init.method} ${url.replace("https://api.github.com/repos/o/r", "")}`);
    return new Response(JSON.stringify({ number: next++ }), { status: 201 });
  }) as typeof fetch;
  const opts = { repo: "o/r", token: "t", fetch: fakeFetch, statePath };
  const item = { key: "notice:x", title: "t", body: "b" };

  assert.deepEqual(await notify([item], opts), { opened: 1, closed: 0 });
  assert.deepEqual(await notify([item], opts), { opened: 0, closed: 0 });
  assert.deepEqual(await notify([], opts), { opened: 0, closed: 1 });
  assert.deepEqual(calls, ["POST /issues", "POST /issues/1/comments", "PATCH /issues/1"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath, "utf8")), {});
});

test("błąd API nie gubi już założonych zgłoszeń", async () => {
  const statePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "notify-")), "notified.json");
  let n = 0;
  const fakeFetch = (async () => (++n === 1 ? new Response(JSON.stringify({ number: 7 }), { status: 201 }) : new Response("x", { status: 500 }))) as unknown as typeof fetch;
  const items = [{ key: "a", title: "", body: "" }, { key: "b", title: "", body: "" }];
  await assert.rejects(notify(items, { repo: "o/r", token: "t", fetch: fakeFetch, statePath }));
  assert.deepEqual(JSON.parse(fs.readFileSync(statePath, "utf8")), { a: { issue: 7, title: "" } });
});
