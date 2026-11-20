// The content script rejects cookie banners on real page loads.
import { autoOpenedSettings, expect, test } from "./fixtures";

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
