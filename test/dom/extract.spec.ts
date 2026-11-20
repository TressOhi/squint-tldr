// HTML-to-text for "paste a link", run in a real browser (it needs DOMParser).
import { buildSync } from "esbuild";
import { expect, test } from "@playwright/test";

const bundle = buildSync({
  entryPoints: ["src/core/documents/extract.ts"],
  bundle: true,
  format: "iife",
  globalName: "SquintExtract",
  write: false,
  target: "chrome116",
}).outputFiles[0]?.text ?? "";

async function textOf(page: import("@playwright/test").Page, html: string): Promise<string> {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ content: bundle });
  return page.evaluate((h) => {
    const w = window as unknown as { SquintExtract: typeof import("../../src/core/documents/extract") };
    return w.SquintExtract.htmlToText(h).text;
  }, html);
}

test("keeps a policy wrapped in a page-wide form (ASP.NET WebForms)", async ({ page }) => {
  const text = await textOf(page, `<body><form id="aspnetForm"><h1>Privacy</h1><p>We sell your data to partners.</p>
    <input type="hidden" name="__VIEWSTATE" value="abc"></form></body>`);
  expect(text).toContain("We sell your data to partners.");
});

test("keeps collapsed accordion sections", async ({ page }) => {
  const text = await textOf(page, `<main><button aria-expanded="false">3. Sharing</button>
    <div aria-hidden="true" hidden><p>We share location with advertisers.</p></div>
    <details><summary>4. Retention</summary><p>We keep data forever.</p></details></main>`);
  expect(text).toContain("3. Sharing");
  expect(text).toContain("We share location with advertisers.");
  expect(text).toContain("We keep data forever.");
});

test("drops scripts, styles, navigation and dropdown options", async ({ page }) => {
  const text = await textOf(page, `<nav>Home About</nav><script>var secret = 1</script><style>p{}</style>
    <p>Real clause.</p><select><option>English</option><option>Deutsch</option></select>`);
  expect(text).toBe("Real clause.");
});
