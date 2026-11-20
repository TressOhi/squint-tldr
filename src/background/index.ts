// Background worker: opens the side panel, records per-tab cookie results, sets the badge.
import { isContentMessage } from "../platform/messages";
import { activeConnection, getSettings, tabKey, type CookieResult } from "../platform/storage";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err: unknown) => {
  console.error("Squint: couldn't set side panel behaviour", err);
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== "install") return;
  void getSettings().then((settings) => {
    if (!activeConnection(settings)) void chrome.runtime.openOptionsPage();
  });
});

chrome.runtime.onMessage.addListener((msg: unknown, sender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined || !isContentMessage(msg)) return;

  if (msg.type === "cookie-result") {
    const cookie: CookieResult = { cmp: msg.cmp, method: msg.method, switched: msg.switched, site: msg.site, at: Date.now() };
    void chrome.storage.session.set({ [tabKey(tabId)]: { cookie } });
    void setBadge(tabId, "✓", "#1e8e3e", "Squint: cookie banner rejected");
    return;
  }

  // policy-page: hint that a scan is available, unless the cookie tick is already showing.
  void chrome.storage.session.get(tabKey(tabId)).then((stored) => {
    if (stored[tabKey(tabId)]) return;
    void setBadge(tabId, "TLDR", "#c27c0e", "Squint: this looks like a policy page. Click to scan it.");
  });
});

async function setBadge(tabId: number, text: string, color: string, title: string): Promise<void> {
  try {
    await Promise.all([
      chrome.action.setBadgeBackgroundColor({ tabId, color }),
      chrome.action.setBadgeText({ tabId, text }),
      chrome.action.setTitle({ tabId, title }),
    ]);
  } catch {
    // The tab closed before we got here.
  }
}

// Every load, including a reload (which reports no url), starts with a clean slate.
// Chrome clears the per-tab badge itself.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") void chrome.storage.session.remove(tabKey(tabId));
});
chrome.tabs.onRemoved.addListener((tabId) => void chrome.storage.session.remove(tabKey(tabId)));
