// Content script, injected into every page and frame. Watches for a cookie banner for a
// short while after load, rejects it, reports back to the background worker, then stops.
import type { ContentMessage } from "../platform/messages";
import { getSettings } from "../platform/storage";
import { looksLikePolicyPage } from "../core/documents/policy-page";
import { tryReject } from "./reject";
import { watch } from "./watch";

const WATCH_MS = 20_000;
const DELAY_MS = 400;
const CONSENT_FRAME_HOST = /privacy-mgmt\.com|sourcepoint|consensu\.org|trustarc|cookiebot|consent|cmp\./i;

const isTopFrame = window === window.top;

void main();

async function main(): Promise<void> {
  if (isTopFrame && looksLikePolicyPage(location.pathname, document.title)) send({ type: "policy-page" });

  const consentFrame = !isTopFrame && CONSENT_FRAME_HOST.test(location.hostname);
  if (!isTopFrame && !consentFrame) return;

  const { autoReject, pausedSites } = await getSettings();
  const site = topSite();
  if (!autoReject || pausedSites.includes(site)) return;

  watch({
    root: document.documentElement,
    delayMs: DELAY_MS,
    timeoutMs: WATCH_MS,
    attempt: async () => {
      const outcome = await tryReject(document, { consentFrame });
      if (outcome) send({ type: "cookie-result", site, ...outcome });
      return outcome !== null;
    },
  });
}

function send(msg: ContentMessage): void {
  chrome.runtime.sendMessage(msg).catch(() => {
    // The background worker may be restarting; a missed badge update is harmless.
  });
}

/** The top page's site, even from inside a cross-origin consent iframe. */
function topSite(): string {
  const origins = location.ancestorOrigins;
  const top = origins.length > 0 ? origins[origins.length - 1] : location.href;
  try {
    return new URL(top ?? location.href).hostname.replace(/^www\./, "");
  } catch {
    return location.hostname.replace(/^www\./, "");
  }
}
