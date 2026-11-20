// Runs one scan: cleans the text, asks the chosen model, then checks its answer against the
// document. Provider details live in ../llm; this file is the same for every provider.
import { ScanError } from "../errors";
import { createClient } from "../llm";
import { costOf, type Connection, type ProviderInfo } from "../llm/providers";
import { SYSTEM_PROMPT } from "./prompt";
import { verifyQuotes } from "./quotes";
import type { Scan } from "./schema";

/** Roughly 150k tokens. Longer documents are cut, and the result says so. */
export const MAX_CHARS = 600_000;
const MIN_CHARS = 200;

export interface AnalyzeInput {
  provider: ProviderInfo;
  connection: Connection;
  text: string;
  url?: string;
  title?: string;
  signal?: AbortSignal;
}

/** Sends a document to the model and returns the validated, quote-checked result. */
export async function analyzeDocument({ provider, connection, text, url = "", title = "", signal }: AnalyzeInput): Promise<Scan> {
  const clean = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length < MIN_CHARS) {
    throw new ScanError(
      "There isn't enough text here to analyse. If the page loads its text as you scroll, open it in a tab and use “Scan this page”.",
      "input",
    );
  }
  const truncated = clean.length > MAX_CHARS;
  const docText = truncated ? clean.slice(0, MAX_CHARS) : clean;

  const client = await createClient(provider, connection);
  const answer = await client.analyze({
    system: SYSTEM_PROMPT,
    docText,
    docTitle: title || url || "Document",
    instruction:
      `Analyse the document above${url ? ` (from ${url})` : ""}.` +
      (truncated ? " It was cut short because of its length; analyse what is there." : ""),
    signal,
  });

  const { verified, rejected } = verifyQuotes(answer.result.flags, docText);
  const rank = { red: 0, amber: 1, green: 2 } as const;
  verified.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return {
    ...answer.result,
    flags: verified,
    droppedFlags: rejected.length,
    truncated,
    url,
    title,
    model: answer.model,
    provider: provider.name,
    costUsd: costOf(provider, answer.model, answer.usage),
    scannedAt: Date.now(),
  };
}
