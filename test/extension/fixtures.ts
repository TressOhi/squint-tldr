// Shared setup for the end-to-end tests: loads the built extension (dist/) into Chromium, and
// fakes AI providers by protocol, so no test depends on a real account or network.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test as base, type BrowserContext, type Page, type Route } from "@playwright/test";
import { PROVIDERS, type Connection, type Protocol, type ProviderInfo } from "../../src/core/llm/providers";

const DIST = resolve("dist");

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form.
  context: async ({}, use) => {
    if (!existsSync(join(DIST, "manifest.json"))) throw new Error("Run `npm run build` before the extension tests.");
    const profile = mkdtempSync(join(tmpdir(), "squint-test-"));
    const context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    await use(context);
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(new URL(worker.url()).host);
  },
});
export { expect };

export const pageUrl = (extensionId: string, page: "sidepanel" | "settings") => `chrome-extension://${extensionId}/pages/${page}.html`;

/** On first install (nothing set up yet) the extension opens its settings tab by itself. */
export async function autoOpenedSettings(context: BrowserContext, extensionId: string): Promise<Page> {
  const url = pageUrl(extensionId, "settings");
  // Chrome may open it in a new tab or reuse the initial blank one, so poll every page.
  let page: Page | undefined;
  await expect.poll(() => (page = context.pages().find((p) => p.url() === url)), { timeout: 10_000 }).toBeTruthy();
  if (!page) throw new Error("Settings page never opened");
  await page.waitForLoadState();
  return page;
}

/** Collects uncaught errors on a page; assert it's empty at the end of a test. */
export function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** A hosted provider from the real provider data, picked by protocol rather than by name. */
export function providerFor(protocol: Protocol): ProviderInfo {
  const provider = PROVIDERS.find((p) => p.protocol === protocol && p.key === "required" && p.baseUrl);
  if (!provider) throw new Error(`No provider speaks ${protocol}`);
  return provider;
}

/** Selects a provider and saves a ready connection for it, as the settings page would. */
export async function useProvider(page: Page, provider: ProviderInfo, conn: Connection): Promise<void> {
  await page.evaluate(
    ([id, c]) => chrome.storage.local.set({ provider: id, connections: { [id]: c } }),
    [provider.id, conn] as const,
  );
}

// ---------- a sample policy and the analysis the fake models return ----------

export const POLICY_TEXT =
  "Acme Privacy Policy. We collect your name, email address and precise location whenever the app is open. " +
  "We may sell your personal information to advertising partners. You can opt out at any time in Settings. " +
  "We keep your data for as long as we consider it useful to our business.";
export const POLICY_HTML = `<!doctype html><html><head><title>Acme Privacy</title></head><body><main><p>${POLICY_TEXT}</p></main></body></html>`;

export const ANALYSIS = {
  document_type: "privacy_policy",
  service_name: "Acme",
  verdict: "high_risk",
  verdict_reason: "Sells your data and keeps it indefinitely.",
  tldr: ["Acme can sell your personal information to advertisers."],
  flags: [
    { severity: "red", category: "data_selling", title: "Sells your data", quote: "We may sell your personal information to advertising partners.", explanation: "Advertisers can buy your details." },
  ],
  opt_outs: [{ action: "Opt out of sale", how: "Settings", url: "" }],
};

export async function servePolicy(context: BrowserContext, origin = "https://policy.squint.test"): Promise<{ count: number }> {
  const calls = { count: 0 };
  await context.route(`${origin}/**`, async (route) => {
    calls.count++;
    await route.fulfill({ contentType: "text/html", body: POLICY_HTML });
  });
  return calls;
}

// ---------- fake providers ----------

export interface FakeProvider {
  /** Analysis requests received (model listings aren't counted). */
  scans: number;
  /** Bodies of those requests, parsed. */
  bodies: Record<string, unknown>[];
}

interface FakeOptions {
  models: string[];
  delayMs?: number;
  /** openai-chat: reject JSON-schema output with a 400, like providers that don't support it. */
  rejectJsonSchema?: boolean;
}

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const fulfilled = (p: Promise<void>) => p.catch(() => undefined); // the page may have cancelled

/** Fakes a provider's endpoint, speaking its protocol. */
export async function fakeProvider(context: BrowserContext, provider: ProviderInfo, opts: FakeOptions): Promise<FakeProvider> {
  const fake: FakeProvider = { scans: 0, bodies: [] };
  const base = provider.baseUrl.replace(/\/$/, "");
  await context.route(`${base}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON() as Record<string, unknown> | null;
    if (provider.protocol === "anthropic-messages") {
      if (path === "/v1/models") {
        return json(route, { data: opts.models.map((id) => ({ type: "model", id, display_name: id.toUpperCase(), created_at: "2026-01-01T00:00:00Z", lifecycle: "active" })), has_more: false, first_id: null, last_id: null });
      }
      if (path.startsWith("/v1/models/")) return json(route, { type: "model", id: path.split("/").pop(), display_name: "", created_at: "2026-01-01T00:00:00Z", capabilities: null, max_tokens: 64_000 });
      if (path === "/v1/messages") {
        fake.scans++;
        if (body) fake.bodies.push(body);
        await new Promise((r) => setTimeout(r, opts.delayMs ?? 0));
        return fulfilled(route.fulfill({ status: 200, contentType: "text/event-stream", body: messagesStream(JSON.stringify(ANALYSIS), String(body?.model)) }));
      }
    } else {
      if (path.endsWith("/models")) return json(route, { object: "list", data: opts.models.map((id) => ({ id, object: "model", created: 0, owned_by: "test" })) });
      if (path.endsWith("/chat/completions")) {
        fake.scans++;
        if (body) fake.bodies.push(body);
        if (opts.rejectJsonSchema && body?.response_format) return json(route, { error: { message: "response_format json_schema is not supported" } }, 400);
        await new Promise((r) => setTimeout(r, opts.delayMs ?? 0));
        return fulfilled(json(route, {
          id: "chatcmpl-test", object: "chat.completion", created: 0, model: body?.model,
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "```json\n" + JSON.stringify(ANALYSIS) + "\n```", refusal: null } }],
          usage: { prompt_tokens: 1000, completion_tokens: 300, total_tokens: 1300 },
        }));
      }
    }
    return json(route, { error: { message: `fake ${provider.protocol}: unexpected ${path}` } }, 404);
  });
  return fake;
}

/** A streamed Messages API response carrying `text`, in the server-sent events format the SDK reads. */
function messagesStream(text: string, model: string): string {
  const events: [string, unknown][] = [
    ["message_start", { type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 300 } }],
    ["message_stop", { type: "message_stop" }],
  ];
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}
