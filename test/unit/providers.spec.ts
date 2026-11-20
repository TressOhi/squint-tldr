// Checks the provider data (src/core/llm/data/providers.json), which TypeScript can only
// partly type, and the provider-neutral helpers around it.
import { expect, test } from "@playwright/test";
import * as z from "zod/v4";
import providers from "../../src/core/llm/data/providers.json" with { type: "json" };
import { costOf, isReady, PROVIDERS, type ProviderInfo } from "../../src/core/llm/providers";

const Price = z.strictObject({ input: z.number().nonnegative(), output: z.number().nonnegative() });
const Https = z.url({ protocol: /^https$/ });
const Provider = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  protocol: z.enum(["anthropic-messages", "openai-chat"]),
  baseUrl: z.union([z.url({ protocol: /^https?$/ }), z.literal("")]),
  key: z.enum(["required", "optional", "none"]),
  keyUrl: Https.optional(),
  keyPlaceholder: z.string().optional(),
  local: z.boolean().optional(),
  defaultModel: z.string().optional(),
  prices: z.record(z.string(), Price).optional(),
  serverFallbackModels: z.array(z.string()).optional(),
  note: z.string().optional(),
});

test("every provider entry is valid", () => {
  for (const entry of providers) {
    const parsed = Provider.safeParse(entry);
    expect(parsed.error?.issues ?? [], entry.id).toEqual([]);
  }
});

test("ids are unique", () => {
  const ids = PROVIDERS.map((p) => p.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("hosted providers use HTTPS; only local ones may use plain HTTP", () => {
  for (const p of PROVIDERS) {
    if (p.baseUrl.startsWith("http:")) expect(p.local, p.id).toBe(true);
    if (!p.local && p.baseUrl) expect(p.baseUrl, p.id).toMatch(/^https:/);
  }
});

test("a provider without a default endpoint asks for one", () => {
  for (const p of PROVIDERS.filter((x) => !x.baseUrl)) expect(p.key, p.id).not.toBe("required");
});

const hosted: ProviderInfo = { id: "h", name: "H", protocol: "openai-chat", baseUrl: "https://h.test", key: "required", prices: { m: { input: 2, output: 10 } } };
const local: ProviderInfo = { id: "l", name: "L", protocol: "openai-chat", baseUrl: "http://localhost:1/v1", key: "none", local: true };
const custom: ProviderInfo = { id: "c", name: "C", protocol: "openai-chat", baseUrl: "", key: "optional" };

test("isReady needs a model, a key when required, and an endpoint", () => {
  expect(isReady(hosted, { apiKey: "k", model: "m", baseUrl: "" })).toBe(true);
  expect(isReady(hosted, { apiKey: "", model: "m", baseUrl: "" })).toBe(false);
  expect(isReady(hosted, { apiKey: "k", model: "", baseUrl: "" })).toBe(false);
  expect(isReady(local, { apiKey: "", model: "llama", baseUrl: "" })).toBe(true);
  expect(isReady(custom, { apiKey: "", model: "x", baseUrl: "" })).toBe(false);
  expect(isReady(custom, { apiKey: "", model: "x", baseUrl: "https://my.server/v1" })).toBe(true);
  expect(isReady(hosted, undefined)).toBe(false);
});

test("cost comes from the provider's price data, or is unknown", () => {
  expect(costOf(hosted, "m", { inputTokens: 1_000_000, outputTokens: 100_000 })).toBeCloseTo(3);
  expect(costOf(hosted, "other", { inputTokens: 1, outputTokens: 1 })).toBeNull();
  expect(costOf(local, "m", { inputTokens: 1, outputTokens: 1 })).toBeNull();
  expect(costOf(hosted, "m", null)).toBeNull();
});
