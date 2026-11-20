// The settings page: choosing a provider, connecting it and picking a model, cookie options.
import { autoOpenedSettings, expect, fakeProvider, pageErrors, providerFor, test } from "./fixtures";
import { PROVIDERS } from "../../src/core/llm/providers";

test("opens on install with no provider chosen, and lists every provider", async ({ context, extensionId }) => {
  const page = await autoOpenedSettings(context, extensionId);
  await expect(page.getByLabel("Provider")).toHaveValue("");
  await expect(page.locator("#connect-form")).toBeHidden();
  const options = await page.locator("#provider option").allTextContents();
  expect(options.slice(1)).toEqual(PROVIDERS.map((p) => p.name));
});

test("a provider that needs a key asks for one first", async ({ context, extensionId }) => {
  const provider = providerFor("openai-chat");
  const page = await autoOpenedSettings(context, extensionId);
  await page.getByLabel("Provider").selectOption(provider.id);
  await expect(page.getByLabel("API key")).toBeVisible();
  await page.getByRole("button", { name: "Save and test" }).click();
  await expect(page.locator("#key-status")).toHaveText("Paste a key first.");
});

for (const protocol of ["anthropic-messages", "openai-chat"] as const) {
  test(`${protocol}: connecting lists the models and saves the choice`, async ({ context, extensionId }) => {
    const provider = providerFor(protocol);
    const models = [provider.defaultModel ?? "model-a", "model-b"];
    await fakeProvider(context, provider, { models });
    const page = await autoOpenedSettings(context, extensionId);
    const errors = pageErrors(page);
    await page.reload();

    await page.getByLabel("Provider").selectOption(provider.id);
    await page.getByLabel("API key").fill("test-key");
    await page.getByRole("button", { name: "Save and test" }).click();
    await expect(page.locator("#key-status")).toHaveText("Connected. 2 models available.");
    await expect(page.getByLabel("Model")).toHaveValue(models[0] ?? "");

    await page.getByLabel("Model").selectOption("model-b");
    await expect
      .poll(() => page.evaluate(async (id) => ((await chrome.storage.local.get("connections")).connections as Record<string, { model: string; apiKey: string }>)[id], provider.id))
      .toEqual({ apiKey: "test-key", model: "model-b", baseUrl: "" });
    expect(await page.evaluate(async () => (await chrome.storage.local.get("provider")).provider)).toBe(provider.id);
    expect(errors).toEqual([]);
  });
}

test("a local provider asks for a server address instead of a key", async ({ context, extensionId }) => {
  const local = PROVIDERS.find((p) => p.local);
  test.skip(!local, "no local provider in the data");
  const page = await autoOpenedSettings(context, extensionId);
  await page.getByLabel("Provider").selectOption(local?.id ?? "");
  await expect(page.getByLabel("Server address")).toBeVisible();
  await expect(page.getByLabel("API key")).toBeHidden();
});

test("toggles cookie auto-reject", async ({ context, extensionId }) => {
  const page = await autoOpenedSettings(context, extensionId);
  await page.getByLabel("Automatically reject cookie banners").uncheck();
  const stored = await page.evaluate(() => chrome.storage.local.get("autoReject"));
  expect(stored.autoReject).toBe(false);
});
