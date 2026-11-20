// The banner watcher's scheduling, in a real browser with a real MutationObserver.
import { buildSync } from "esbuild";
import { expect, test } from "@playwright/test";

const bundle = buildSync({
  entryPoints: ["src/content/watch.ts"],
  bundle: true,
  format: "iife",
  globalName: "SquintWatch",
  write: false,
  target: "chrome116",
}).outputFiles[0]?.text ?? "";

test.beforeEach(async ({ page }) => {
  await page.setContent("<!doctype html><html><body><div id=ticker></div></body></html>");
  await page.addScriptTag({ content: bundle });
});

test("still finds a late banner on a page that never stops changing", async ({ page }) => {
  const found = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const w = window as unknown as { SquintWatch: typeof import("../../src/content/watch") };
        // A ticker that mutates the DOM every 30ms, far more often than the 100ms delay.
        const ticker = setInterval(() => {
          document.body.firstElementChild?.replaceChildren(String(Date.now()));
        }, 30);
        setTimeout(() => {
          document.body.append(Object.assign(document.createElement("div"), { id: "banner" }));
        }, 300);
        w.SquintWatch.watch({
          root: document.body,
          delayMs: 100,
          timeoutMs: 2000,
          attempt: () => {
            const hit = document.getElementById("banner") !== null;
            if (hit) {
              clearInterval(ticker);
              resolve(true);
            }
            return Promise.resolve(hit);
          },
        });
        setTimeout(() => {
          resolve(false);
        }, 2500);
      }),
  );
  expect(found).toBe(true);
});

test("a change during a slow attempt triggers one more attempt", async ({ page }) => {
  const calls = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const w = window as unknown as { SquintWatch: typeof import("../../src/content/watch") };
        let calls = 0;
        w.SquintWatch.watch({
          root: document.body,
          delayMs: 20,
          timeoutMs: 2000,
          attempt: async () => {
            calls++;
            if (calls === 1) {
              // The banner shows up while the first attempt is still busy.
              document.body.append(document.createElement("div"));
              await new Promise((r) => setTimeout(r, 200));
            }
            return calls >= 2;
          },
        });
        setTimeout(() => {
          resolve(calls);
        }, 800);
      }),
  );
  expect(calls).toBe(2);
});

test("stops at the timeout", async ({ page }) => {
  const calls = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const w = window as unknown as { SquintWatch: typeof import("../../src/content/watch") };
        let calls = 0;
        const ticker = setInterval(() => {
          document.body.append(document.createElement("i"));
        }, 20);
        w.SquintWatch.watch({ root: document.body, delayMs: 20, timeoutMs: 200, attempt: () => Promise.resolve(++calls < 0) });
        setTimeout(() => {
          const atTimeout = calls;
          setTimeout(() => {
            clearInterval(ticker);
            resolve(calls - atTimeout);
          }, 300);
        }, 250);
      }),
  );
  expect(calls).toBe(0);
});
