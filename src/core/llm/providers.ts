// The AI providers Squint can use. The list itself is data (data/providers.json); code only
// knows the wire protocols, each handled by one adapter in this folder. Adding a provider that
// speaks a known protocol is a JSON change, with no code.
import providers from "./data/providers.json" with { type: "json" };

/** The APIs Squint can speak. Each has an adapter: see ./index.ts. */
export type Protocol = "anthropic-messages" | "openai-chat";

/** USD per million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
}

export interface ProviderInfo {
  /** Stable id, used as the storage key for this provider's connection. */
  id: string;
  name: string;
  protocol: Protocol;
  /** Default endpoint. Users can change it for local and custom providers. */
  baseUrl: string;
  key: "required" | "optional" | "none";
  keyUrl?: string;
  keyPlaceholder?: string;
  /** Runs on the user's machine: the endpoint is editable and nothing leaves the computer. */
  local?: boolean;
  /** Preselected when the provider's model list includes it. */
  defaultModel?: string;
  /** Known prices by model id, for the cost shown after a scan. Unlisted models show no cost. */
  prices?: Record<string, ModelPrice>;
  /** anthropic-messages only: models that get the API's server-side refusal fallback. */
  serverFallbackModels?: string[];
  /** Shown under the provider picker. */
  note?: string;
}

// JSON can't carry the string unions above; test/unit/providers.spec.ts checks every entry.
export const PROVIDERS = providers as readonly ProviderInfo[];

export const findProvider = (id: string): ProviderInfo | undefined => PROVIDERS.find((p) => p.id === id);

/** What Squint needs to call one provider. Stored per provider, so switching back keeps it. */
export interface Connection {
  apiKey: string;
  model: string;
  /** Empty means the provider's default. */
  baseUrl: string;
}

export const emptyConnection = (provider: ProviderInfo): Connection => ({
  apiKey: "",
  model: provider.defaultModel ?? "",
  baseUrl: "",
});

export const baseUrlOf = (provider: ProviderInfo, conn: Connection): string => conn.baseUrl.trim() || provider.baseUrl;

/** A connection that can run a scan: it has a model, a key if one is needed, and an endpoint. */
export function isReady(provider: ProviderInfo, conn: Connection | undefined): conn is Connection {
  return !!conn && !!conn.model && (provider.key !== "required" || !!conn.apiKey) && !!baseUrlOf(provider, conn);
}

/** Cost of a call in USD, or null when the provider's data has no price for the model. */
export function costOf(provider: ProviderInfo, model: string, usage: TokenUsage | null): number | null {
  const price = provider.prices?.[model];
  if (!price || !usage) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}
