// The side panel: scanning by link with each protocol, caching, cancelling, errors.
import type { BrowserContext, Page } from "@playwright/test";
import { expect, fakeProvider, pageErrors, pageUrl, providerFor, servePolicy, test, useProvider } from "./fixtures";
import type { ProviderInfo } from "../../src/core/llm/providers";

async function openPanel(context: BrowserContext, extensionId: string): Promise<Page> {
  const panel = await context.newPage();
  await panel.goto(pageUrl(extensionId, "sidepanel"));
  return panel;
}

async function connected(context: BrowserContext, extensionId: string, provider: ProviderInfo, model: string): Promise<Page> {
  const panel = await openPanel(context, extensionId);
  await useProvider(panel, provider, { apiKey: "test-key", model, baseUrl: "" });
  await expect(panel.locator("#no-key")).toBeHidden();
  return panel;
}

async function scanLink(panel: Page, link: string): Promise<void> {
  await panel.getByLabel("Link to a policy").fill(link);
  await panel.locator("#link-submit").click();
}

test("renders and asks to connect a model", async ({ context, extensionId }) => {
  const panel = await openPanel(context, extensionId);
  const errors = pageErrors(panel);
  await expect(panel.getByRole("button", { name: "Scan this page" })).toBeVisible();
  await expect(panel.locator("#no-key")).toBeVisible();
  // Regression: component CSS once overrode [hidden] and showed the spinner while idle.
  await expect(panel.locator("#status")).toBeHidden();
  await expect(panel.locator("#error")).toBeHidden();
  expect(errors).toEqual([]);
});

test("anthropic-messages: bare domain, one call per double click, cache, then Clear result", async ({ context, extensionId }) => {
  const provider = providerFor("anthropic-messages");
  const model = provider.defaultModel ?? "test-model";
  const fake = await fakeProvider(context, provider, { models: [model], delayMs: 300 });
  const policy = await servePolicy(context);
  const panel = await connected(context, extensionId, provider, model);
  const errors = pageErrors(panel);

  // No "https://", and a double submit while the first is still in flight.
  await panel.getByLabel("Link to a policy").fill("policy.squint.test/privacy");
  await panel.locator("#link-submit").dblclick();
  await panel.getByLabel("Link to a policy").press("Enter");
  await expect(panel.locator(".flag-title")).toHaveText("Sells your data", { timeout: 10_000 });
  await expect(panel.locator(".verdict")).toHaveText("High risk");
  expect(fake.scans).toBe(1);
  expect(fake.bodies[0]?.model).toBe(model);
  // The cost line appears only when the provider data has a price for the model.
  await expect(panel.locator(".footnote")).toContainText(provider.prices?.[model] ? "on your key" : `with ${model}`);

  // Scanning the same link again is served from the cache: no download, no API call.
  await panel.locator("#link-submit").click();
  await expect(panel.locator(".flag-title")).toBeVisible();
  expect([fake.scans, policy.count]).toEqual([1, 1]);

  // Clear result hides it and forgets it, so it doesn't come back.
  await panel.getByRole("button", { name: "Clear result" }).click();
  await expect(panel.locator("#result")).toBeHidden();
  await expect.poll(() => panel.evaluate(async () => Object.keys((await chrome.storage.local.get("scanCache")).scanCache ?? {}))).toEqual([]);
  await panel.waitForTimeout(500);
  await expect(panel.locator("#result")).toBeHidden();
  expect(errors).toEqual([]);
});

test("openai-chat: falls back to a prompted schema when JSON-schema output is refused", async ({ context, extensionId }) => {
  const provider = providerFor("openai-chat");
  const fake = await fakeProvider(context, provider, { models: ["test-model"], rejectJsonSchema: true });
  await servePolicy(context);
  const panel = await connected(context, extensionId, provider, "test-model");
  const errors = pageErrors(panel);

  await scanLink(panel, "https://policy.squint.test/privacy");
  await expect(panel.locator(".flag-title")).toHaveText("Sells your data", { timeout: 10_000 });
  // First try asked for strict JSON-schema output; the retry put the schema in the prompt.
  expect(fake.scans).toBe(2);
  expect(fake.bodies[0]).toHaveProperty("response_format");
  expect(fake.bodies[1]).not.toHaveProperty("response_format");
  expect(JSON.stringify(fake.bodies[1]?.messages)).toContain("JSON Schema");
  await expect(panel.locator(".footnote")).toContainText(`with test-model (${provider.name})`);
  await expect(panel.locator(".footnote")).not.toContainText("$");
  expect(errors).toEqual([]);
});

test("Cancel stops a link that is still downloading", async ({ context, extensionId }) => {
  const provider = providerFor("openai-chat");
  await fakeProvider(context, provider, { models: ["test-model"] });
  await context.route("https://slow.squint.test/**", () => undefined); // never answers
  const panel = await connected(context, extensionId, provider, "test-model");

  await scanLink(panel, "https://slow.squint.test/terms");
  await expect(panel.locator("#status-text")).toHaveText("Fetching the page…");
  await panel.getByRole("button", { name: "Cancel" }).click();
  await expect(panel.locator("#status")).toBeHidden();
  await expect(panel.locator("#link-submit")).toBeEnabled();
  await expect(panel.locator("#error")).toBeHidden();
});

test("a link that isn't a web address shows an error", async ({ context, extensionId }) => {
  const provider = providerFor("openai-chat");
  const fake = await fakeProvider(context, provider, { models: ["test-model"] });
  const panel = await connected(context, extensionId, provider, "test-model");
  await scanLink(panel, "not a link");
  await expect(panel.locator("#error")).toHaveText("That doesn't look like a web address.");
  expect(fake.scans).toBe(0);
});
