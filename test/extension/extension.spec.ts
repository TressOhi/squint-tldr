// Loads the built extension (dist/) into Chromium and checks it end to end: the content
// script rejects a banner on a real page load, and the side panel and settings render.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect, test as base, type BrowserContext, type Page } from "@playwright/test";

const DIST = resolve("dist");

const test = base.extend<{ context: BrowserContext; extensionId: string }>({
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

/** On first install (no key yet) the extension opens its settings tab by itself. */
async function autoOpenedSettings(context: BrowserContext, extensionId: string): Promise<Page> {
  const url = `chrome-extension://${extensionId}/settings.html`;
  // Chrome may open it in a new tab or reuse the initial blank one, so poll every page.
  let page: Page | undefined;
  await expect.poll(() => (page = context.pages().find((p) => p.url() === url)), { timeout: 10_000 }).toBeTruthy();
  if (!page) throw new Error("Settings page never opened");
  await page.waitForLoadState();
  return page;
}

const PAGE = `<!doctype html><html><head><title>Shop</title></head><body>
  <h1>Welcome</h1>
  <div id="cookie-consent" style="position:fixed;bottom:0;left:0;right:0;padding:16px;background:#eee">
    We use cookies for analytics and advertising.
    <button id="accept" onclick="document.title='accepted'">Accept all</button>
    <button id="reject" onclick="document.title='rejected'">Reject all</button>
  </div>
</body></html>`;

test("rejects a cookie banner on page load", async ({ context }) => {
  await context.route("https://shop.squint.test/**", (route) => route.fulfill({ contentType: "text/html", body: PAGE }));
  const page = await context.newPage();
  await page.goto("https://shop.squint.test/");
  await expect(page).toHaveTitle("rejected", { timeout: 10_000 });
});

test("does nothing on a paused site", async ({ context, extensionId }) => {
  await context.route("https://paused.squint.test/**", (route) => route.fulfill({ contentType: "text/html", body: PAGE }));
  const settings = await autoOpenedSettings(context, extensionId);
  await settings.evaluate(() => chrome.storage.local.set({ pausedSites: ["paused.squint.test"] }));

  const page = await context.newPage();
  await page.goto("https://paused.squint.test/");
  await page.waitForTimeout(2000);
  await expect(page).toHaveTitle("Shop");
});

test("side panel renders and asks for a key", async ({ context, extensionId }) => {
  const panel = await context.newPage();
  const errors: string[] = [];
  panel.on("pageerror", (e) => errors.push(e.message));
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole("button", { name: "Scan this page" })).toBeVisible();
  await expect(panel.locator("#no-key")).toBeVisible();
  // Regression: component CSS once overrode [hidden] and showed the spinner while idle.
  await expect(panel.locator("#status")).toBeHidden();
  await expect(panel.locator("#error")).toBeHidden();
  await panel.getByPlaceholder("https://example.com/terms").fill("example.com/terms");
  expect(errors).toEqual([]);
});

test("settings opens on install, rejects an empty key and toggles auto-reject", async ({ context, extensionId }) => {
  const page = await autoOpenedSettings(context, extensionId);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.reload();
  await page.getByRole("button", { name: "Save and test" }).click();
  await expect(page.locator("#key-status")).toHaveText("Paste a key first.");

  await page.getByLabel("Automatically reject cookie banners").uncheck();
  const stored = await page.evaluate(() => chrome.storage.local.get("autoReject"));
  expect(stored.autoReject).toBe(false);
  expect(errors).toEqual([]);
});

// ---------- scanning, with Anthropic's API faked ----------

const POLICY_TEXT =
  "Acme Privacy Policy. We collect your name, email address and precise location whenever the app is open. " +
  "We may sell your personal information to advertising partners. You can opt out at any time in Settings. " +
  "We keep your data for as long as we consider it useful to our business.";
const POLICY_HTML = `<!doctype html><html><head><title>Acme Privacy</title></head><body><main><p>${POLICY_TEXT}</p></main></body></html>`;

const ANALYSIS = {
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

/** A streamed Messages API response carrying `text`, in the server-sent events format the SDK reads. */
function sse(text: string): string {
  const events: [string, unknown][] = [
    ["message_start", { type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 300 } }],
    ["message_stop", { type: "message_stop" }],
  ];
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

/** Opens the side panel as a tab with a key set, and counts calls to the (faked) API. */
async function panelWithFakeApi(context: BrowserContext, extensionId: string, { apiDelayMs = 300 } = {}) {
  const calls = { api: 0, policy: 0 };
  await context.route("https://api.anthropic.com/**", async (route) => {
    calls.api++;
    await new Promise((r) => setTimeout(r, apiDelayMs));
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse(JSON.stringify(ANALYSIS)) }).catch(() => undefined);
  });
  await context.route("https://policy.squint.test/**", async (route) => {
    calls.policy++;
    await route.fulfill({ contentType: "text/html", body: POLICY_HTML });
  });
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.evaluate(() => chrome.storage.local.set({ apiKey: "sk-ant-test" }));
  await expect(panel.locator("#no-key")).toBeHidden();
  return { panel, calls };
}

test("link scan: bare domain, one API call per double click, cache, then Clear result", async ({ context, extensionId }) => {
  const { panel, calls } = await panelWithFakeApi(context, extensionId);
  const errors: string[] = [];
  panel.on("pageerror", (e) => errors.push(e.message));

  // No "https://", and a double submit while the first is still in flight.
  await panel.getByLabel("Link to a policy").fill("policy.squint.test/privacy");
  await panel.locator("#link-submit").dblclick();
  await panel.getByLabel("Link to a policy").press("Enter");
  await expect(panel.locator(".flag-title")).toBeVisible({ timeout: 10_000 });
  await expect(panel.locator(".verdict")).toHaveText("High risk");
  await expect(panel.locator(".flag-title")).toHaveText("Sells your data");
  expect(calls.api).toBe(1);

  // Scanning the same link again is served from the cache: no download, no API call.
  await panel.locator("#link-submit").click();
  await expect(panel.locator(".flag-title")).toBeVisible();
  expect(calls).toEqual({ api: 1, policy: 1 });

  // Clear result hides it and forgets it, so it doesn't come back.
  await panel.getByRole("button", { name: "Clear result" }).click();
  await expect(panel.locator("#result")).toBeHidden();
  await expect.poll(() => panel.evaluate(async () => Object.keys((await chrome.storage.local.get("scanCache")).scanCache ?? {}))).toEqual([]);
  await panel.waitForTimeout(500);
  await expect(panel.locator("#result")).toBeHidden();
  expect(errors).toEqual([]);
});

test("Cancel stops a link that is still downloading", async ({ context, extensionId }) => {
  const { panel } = await panelWithFakeApi(context, extensionId);
  // Never answers.
  await context.route("https://slow.squint.test/**", () => undefined);
  await panel.getByLabel("Link to a policy").fill("https://slow.squint.test/terms");
  await panel.locator("#link-submit").click();
  await expect(panel.locator("#status-text")).toHaveText("Fetching the page…");
  await panel.getByRole("button", { name: "Cancel" }).click();
  await expect(panel.locator("#status")).toBeHidden();
  await expect(panel.locator("#link-submit")).toBeEnabled();
  await expect(panel.locator("#error")).toBeHidden();
});

test("a link that isn't a web address shows an error", async ({ context, extensionId }) => {
  const { panel, calls } = await panelWithFakeApi(context, extensionId);
  await panel.getByLabel("Link to a policy").fill("not a link");
  await panel.locator("#link-submit").click();
  await expect(panel.locator("#error")).toHaveText("That doesn't look like a web address.");
  expect(calls.api).toBe(0);
});
