// Runs the real cookie rejecter against fixture banners in Chromium. Each fixture records
// which buttons were clicked, so we can assert it chose the private option and nothing else.
import { buildSync } from "esbuild";
import { expect, test, type Page } from "@playwright/test";

const bundle = buildSync({
  entryPoints: ["src/content/reject.ts"],
  bundle: true,
  format: "iife",
  globalName: "SquintReject",
  write: false,
  target: "chrome116",
}).outputFiles[0]?.text ?? "";

interface Outcome {
  cmp: string;
  method: string;
  switched: number;
}

const RECORD_CLICKS = `<script>
  window.clicked = [];
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-id]");
    if (t) window.clicked.push(t.dataset.id);
  }, true);
</script>`;

async function run(page: Page, html: string): Promise<{ outcome: Outcome | null; clicked: string[] }> {
  await page.setContent(`<!doctype html><html><body>${RECORD_CLICKS}${html}</body></html>`);
  await page.addScriptTag({ content: bundle });
  return page.evaluate(async () => {
    const w = window as unknown as {
      SquintReject: { tryReject: (d: Document, o: { settleMs: number }) => Promise<Outcome | null> };
      clicked: string[];
    };
    const outcome = await w.SquintReject.tryReject(document, { settleMs: 50 });
    return { outcome, clicked: w.clicked };
  });
}

const banner = (inner: string, attrs = 'id="cookie-banner"') =>
  `<div ${attrs} style="position:fixed;bottom:0;left:0;right:0;padding:16px;background:#eee">
     We use cookies to improve your experience and for advertising. ${inner}
   </div>`;

test("OneTrust: clicks Reject All", async ({ page }) => {
  const { outcome, clicked } = await run(page, `
    <div id="onetrust-banner-sdk"><p>We use cookies.</p>
      <button id="onetrust-accept-btn-handler" data-id="accept">Accept All Cookies</button>
      <button id="onetrust-reject-all-handler" data-id="reject">Reject All</button>
    </div>`);
  expect(outcome).toEqual({ cmp: "OneTrust", method: "reject_all", switched: 0 });
  expect(clicked).toEqual(["reject"]);
});

test("OneTrust without a reject button: opens settings, switches categories off, saves", async ({ page }) => {
  const { outcome, clicked } = await run(page, `
    <div id="onetrust-banner-sdk"><p>We use cookies.</p>
      <button id="onetrust-accept-btn-handler" data-id="accept">Accept All Cookies</button>
      <button id="onetrust-pc-btn-handler" data-id="settings"
        onclick="document.getElementById('onetrust-pc-sdk').style.display='block'">Cookie Settings</button>
    </div>
    <div id="onetrust-pc-sdk" style="display:none">
      <label>Strictly necessary <input type="checkbox" checked disabled data-id="necessary"></label>
      <label>Performance <input type="checkbox" checked data-id="performance"></label>
      <label>Targeting <input type="checkbox" checked data-id="targeting"></label>
      <label>Functional <input type="checkbox" data-id="functional"></label>
      <button id="accept-recommended-btn-handler" data-id="allow-all">Allow All</button>
      <button class="save-preference-btn-handler" data-id="save">Confirm My Choices</button>
    </div>`);
  expect(outcome).toEqual({ cmp: "OneTrust", method: "settings", switched: 2 });
  expect(clicked).toEqual(["settings", "performance", "targeting", "save"]);
  expect(await page.isChecked("[data-id=necessary]")).toBe(true);
});

test("Cookiebot: clicks Deny", async ({ page }) => {
  const { outcome, clicked } = await run(page, `
    <div id="CybotCookiebotDialog"><p>This website uses cookies.</p>
      <button id="CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll" data-id="accept">Allow all</button>
      <button id="CybotCookiebotDialogBodyButtonDecline" data-id="deny">Deny</button>
    </div>`);
  expect(outcome?.cmp).toBe("Cookiebot");
  expect(clicked).toEqual(["deny"]);
});

test("Usercentrics inside a shadow root", async ({ page }) => {
  const { outcome, clicked } = await run(page, `
    <div id="usercentrics-root"></div>
    <script>
      const root = document.getElementById("usercentrics-root").attachShadow({ mode: "open" });
      root.innerHTML = '<div data-testid="uc-default-banner">We use cookies.' +
        '<button data-testid="uc-accept-all-button" data-id="accept">Accept All</button>' +
        '<button data-testid="uc-deny-all-button" data-id="deny">Deny</button></div>';
      root.addEventListener("click", (e) => { const t = e.target.closest("[data-id]"); if (t) window.clicked.push(t.dataset.id); }, true);
    </script>`);
  expect(outcome?.cmp).toBe("Usercentrics");
  expect(clicked).toEqual(["deny"]);
});

test("unknown banner: finds Reject all by its label", async ({ page }) => {
  const { outcome, clicked } = await run(page, banner(`
    <button data-id="accept">Accept all</button>
    <button data-id="reject">Reject all</button>`));
  expect(outcome?.cmp).toBe("generic");
  expect(clicked).toEqual(["reject"]);
});

test("unknown banner in German", async ({ page }) => {
  const { clicked } = await run(page, banner(`
    <button data-id="accept">Alle akzeptieren</button>
    <button data-id="reject">Alle ablehnen</button>`));
  expect(clicked).toEqual(["reject"]);
});

test("accept-only banner: clicks nothing", async ({ page }) => {
  const { outcome, clicked } = await run(page, banner(`
    <button data-id="accept">Accept</button>
    <button data-id="settings">Manage preferences</button>`));
  expect(outcome).toBeNull();
  expect(clicked).toEqual([]);
});

test("never follows a reject link that leaves the page", async ({ page }) => {
  const { outcome, clicked } = await run(page, banner(`<a href="https://example.com/opt-out" data-id="link">Reject all</a>`));
  expect(outcome).toBeNull();
  expect(clicked).toEqual([]);
});

test("ignores dialogs that aren't about cookies", async ({ page }) => {
  const { outcome, clicked } = await run(page, `
    <div role="dialog">Subscribe to our newsletter! Read our privacy policy.
      <button data-id="decline">Decline</button>
    </div>`);
  expect(outcome).toBeNull();
  expect(clicked).toEqual([]);
});

test("ignores hidden banners", async ({ page }) => {
  const { outcome } = await run(page, banner(`<button data-id="reject">Reject all</button>`, 'id="cookie-banner" hidden'));
  expect(outcome).toBeNull();
});
