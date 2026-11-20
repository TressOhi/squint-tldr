// Builds the client for whichever provider the user selected. Providers are data
// (data/providers.json); the only code per provider is the adapter for its protocol, and each
// adapter, with its SDK, is loaded only when it's used.
import type { Connection, Protocol, ProviderInfo } from "./providers";
import type { LlmAdapter, LlmClient } from "./types";

const ADAPTERS: Record<Protocol, () => Promise<LlmAdapter>> = {
  "anthropic-messages": async () => (await import("./adapters/anthropic-messages")).anthropicMessages,
  "openai-chat": async () => (await import("./adapters/openai-chat")).openAiChat,
};

export async function createClient(provider: ProviderInfo, conn: Connection): Promise<LlmClient> {
  const adapter = await ADAPTERS[provider.protocol]();
  return adapter(provider, conn);
}

export type { LlmClient, ModelOption } from "./types";
