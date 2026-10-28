// Jedno miejsce wywołań Claude: ścisły schemat JSON, bez narzędzi.
// Treść ze strony przedszkola jest niezaufana – model może tylko zwrócić dane w schemacie.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { loadEnv } from "./config.js";

export const MODEL = "claude-opus-5-5";
// Cennik Claude Opus 5.5 (USD za 1M tokenów) – do raportu kosztów.
export const PRICE_PER_MTOK = { input: 4, output: 20 };

export interface StructuredResult<T> {
  output: T;
  model: string;
  stopReason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

let client: Anthropic | undefined;

export function getClient(): Anthropic {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Brak klucza API. Skopiuj .env.example jako .env i wpisz ANTHROPIC_API_KEY.");
  }
  return (client ??= new Anthropic());
}

export function costUsd(usage: { input_tokens: number; output_tokens: number }): number {
  return (usage.input_tokens * PRICE_PER_MTOK.input + usage.output_tokens * PRICE_PER_MTOK.output) / 1e6;
}

export async function callStructured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  effort: "low" | "medium" | "high";
  maxTokens: number;
}): Promise<StructuredResult<z.infer<S>>> {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: opts.maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") throw new Error("Model odmówił odpowiedzi");
  if (message.stop_reason === "max_tokens") throw new Error("Odpowiedź ucięta (max_tokens)");
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return {
    output: opts.schema.parse(JSON.parse(text)),
    model: message.model,
    stopReason: message.stop_reason,
    usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
  };
}
