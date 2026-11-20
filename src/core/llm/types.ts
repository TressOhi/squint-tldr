import type { AnalysisResult } from "../analysis/schema";
import type { Connection, ProviderInfo, TokenUsage } from "./providers";

export interface LlmRequest {
  system: string;
  docText: string;
  docTitle: string;
  /** The user turn after the document. */
  instruction: string;
  signal?: AbortSignal | undefined;
}

export interface LlmAnswer {
  result: AnalysisResult;
  /** The model that actually answered (it can differ from the one asked for, e.g. after a fallback). */
  model: string;
  /** Null when the provider didn't report it. */
  usage: TokenUsage | null;
}

export interface ModelOption {
  id: string;
  label: string;
}

export interface LlmClient {
  analyze(req: LlmRequest): Promise<LlmAnswer>;
  /** Lists the models this key can use. Free on every provider, so it doubles as a key check. */
  listModels(signal?: AbortSignal): Promise<ModelOption[]>;
}

/** An adapter: builds a client for any provider that speaks its protocol. */
export type LlmAdapter = (provider: ProviderInfo, conn: Connection) => LlmClient;

/** Appended to the system prompt when the provider can't enforce the schema itself. */
export const jsonInstructions = (schema: unknown): string =>
  `\n\nReply with only a JSON object and no other text. It must match this JSON Schema exactly:\n${JSON.stringify(schema)}`;
