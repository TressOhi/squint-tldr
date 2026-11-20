import { analyzeDocument } from "../../core/analysis/analyze";
import { ScanError } from "../../core/errors";
import { fetchDocument, FetchError } from "../../core/documents/extract";
import { CATEGORIES, type DocumentType, type Flag, type Scan, type Verdict } from "../../core/analysis/schema";
import {
  activeConnection,
  documentKey,
  getCachedScan,
  getSettings,
  getTabCookieResult,
  putCachedScan,
  removeCachedScan,
  setSettings,
  siteOf,
  type CookieResult,
} from "../../platform/storage";
import { el, mustGet } from "../dom";

const DOC_TYPES: Record<DocumentType, string> = {
  privacy_policy: "Privacy policy",
  terms_of_service: "Terms of service",
  cookie_policy: "Cookie policy",
  eula: "Licence agreement",
  other_legal: "Legal document",
  not_a_policy: "Not a policy",
};
const VERDICTS: Record<Verdict, string> = { high_risk: "High risk", some_concerns: "Some concerns", low_risk: "Looks fair" };

const ui = {
  noKey: mustGet("no-key"),
  addKey: mustGet("add-key"),
  openSettings: mustGet("open-settings"),
  scanPage: mustGet("scan-page", HTMLButtonElement),
  linkForm: mustGet("link-form", HTMLFormElement),
  linkInput: mustGet("link-input", HTMLInputElement),
  linkSubmit: mustGet("link-submit", HTMLButtonElement),
  pasteInput: mustGet("paste-input", HTMLTextAreaElement),
  scanPaste: mustGet("scan-paste", HTMLButtonElement),
  status: mustGet("status"),
  statusText: mustGet("status-text"),
  cancel: mustGet("cancel"),
  error: mustGet("error"),
  result: mustGet("result"),
  cookieDot: mustGet("cookie-dot"),
  cookieTitle: mustGet("cookie-title"),
  cookieDetail: mustGet("cookie-detail"),
  siteName: mustGet("site-name"),
  siteToggle: mustGet("site-toggle", HTMLInputElement),
};

type Source = "page" | "link" | "paste";
interface PendingDocument {
  text: string;
  title: string;
  url: string;
  source: Source;
}

let activeTab: chrome.tabs.Tab | undefined;
let controller: AbortController | null = null;
/** Where the result on screen came from. Link and paste results stay put when tabs change. */
let shown: Source | null = null;
/** Bumped by every refresh(), so a slower, older refresh can't overwrite a newer one. */
let refreshGeneration = 0;

const isWebUrl = (url: string | undefined): url is string => !!url && /^https?:/.test(url);

// ---------- current tab & cookie status ----------

async function refresh(): Promise<void> {
  const generation = ++refreshGeneration;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url;
  const site = isWebUrl(url) ? siteOf(url) : "";
  const [settings, cookie, cached] = await Promise.all([
    getSettings(),
    tab?.id !== undefined ? getTabCookieResult(tab.id) : null,
    isWebUrl(url) ? getCachedScan(documentKey(url)) : null,
  ]);
  if (generation !== refreshGeneration) return;

  activeTab = tab;
  const paused = settings.pausedSites.includes(site);

  ui.noKey.hidden = activeConnection(settings) !== null;
  ui.scanPage.disabled = !isWebUrl(url) || controller !== null;
  ui.siteName.textContent = site || "this site";
  ui.siteToggle.disabled = !site || !settings.autoReject;
  ui.siteToggle.checked = !paused;

  renderCookieStatus({ enabled: settings.autoReject, isWeb: !!site, paused, cookie });

  if (controller === null && shown !== "link" && shown !== "paste") {
    if (cached) renderResult(cached, "page");
    else clearResult();
  }
}

function renderCookieStatus(s: { enabled: boolean; isWeb: boolean; paused: boolean; cookie: CookieResult | null }): void {
  const [state, title, detail] = ((): [string, string, string] => {
    if (!s.enabled) return ["off", "Cookie auto-reject is off", "Turn it on in Settings."];
    if (!s.isWeb) return ["", "Cookie banners", "Open a website to see what Squint did."];
    if (s.paused) return ["off", "Paused on this site", "Squint won't touch cookie banners here."];
    if (!s.cookie) return ["", "No cookie banner handled", "Either there wasn't one, or Squint didn't recognise it."];
    const how =
      s.cookie.method === "settings"
        ? `Switched off ${s.cookie.switched} optional ${s.cookie.switched === 1 ? "category" : "categories"} and saved`
        : "Chose “Reject all”";
    const vendor = s.cookie.cmp !== "generic" ? ` (${s.cookie.cmp})` : "";
    return ["ok", "Cookie banner rejected", `${how}${vendor}.`];
  })();
  ui.cookieDot.className = `dot ${state}`.trim();
  ui.cookieTitle.textContent = title;
  ui.cookieDetail.textContent = detail;
}

chrome.tabs.onActivated.addListener(() => void refresh());
chrome.tabs.onUpdated.addListener((id, info) => {
  if (id === activeTab?.id && (info.status === "complete" || info.url)) void refresh();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" || "provider" in changes || "connections" in changes || "autoReject" in changes || "pausedSites" in changes || "scanCache" in changes) {
    void refresh();
  }
});

ui.siteToggle.addEventListener("change", () => void togglePause());

async function togglePause(): Promise<void> {
  const site = isWebUrl(activeTab?.url) ? siteOf(activeTab.url) : "";
  if (!site) return;
  const { pausedSites } = await getSettings();
  const next = ui.siteToggle.checked ? pausedSites.filter((s) => s !== site) : [...new Set([...pausedSites, site])];
  await setSettings({ pausedSites: next });
}

ui.openSettings.addEventListener("click", () => void chrome.runtime.openOptionsPage());
ui.addKey.addEventListener("click", (e) => {
  e.preventDefault();
  void chrome.runtime.openOptionsPage();
});

// ---------- scanning ----------

ui.scanPage.addEventListener("click", () => {
  const tab = activeTab;
  if (tab?.id === undefined || !isWebUrl(tab.url)) return;
  const tabId = tab.id;
  const url = documentKey(tab.url);
  void runScan(async () => {
    setStatus("Reading the page…");
    try {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => ({ text: document.body.innerText, title: document.title }),
      });
      const page = injection?.result;
      if (!page) throw new Error("no result");
      return { ...page, url, source: "page" };
    } catch {
      throw new ScanError("Chrome doesn't let extensions read this page.", "input");
    }
  });
});

ui.linkForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = parseLink(ui.linkInput.value);
  if (!url) {
    showError("That doesn't look like a web address.");
    return;
  }
  void runScan(async (signal) => {
    // Skip the download too when this exact link was scanned before.
    const cached = await getCachedScan(documentKey(url));
    if (cached) return { cached, source: "link" };
    setStatus("Fetching the page…");
    const doc = await fetchDocument(url, signal);
    return { text: doc.text, title: doc.title, url: documentKey(doc.finalUrl), source: "link" };
  });
});

/** "example.com/terms" → "https://example.com/terms"; null if it isn't a usable web address. */
function parseLink(raw: string): string | null {
  const trimmed = raw.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.includes(".") || url.hostname === "localhost" ? url.href : null;
  } catch {
    return null;
  }
}

ui.scanPaste.addEventListener("click", () => {
  const text = ui.pasteInput.value;
  void runScan(() => Promise.resolve({ text, title: "Pasted text", url: "", source: "paste" }));
});

ui.cancel.addEventListener("click", () => controller?.abort());

type Loaded = PendingDocument | { cached: Scan; source: Source };

async function runScan(load: (signal: AbortSignal) => Promise<Loaded>): Promise<void> {
  // Claim the scan synchronously, before any await, so a double click can't start two.
  if (controller) return;
  const ctrl = new AbortController();
  controller = ctrl;
  const { signal } = ctrl;
  hideError();
  setBusy(true);
  clearResult();
  setStatus("Reading the small print…");
  try {
    const doc = await load(signal);
    signal.throwIfAborted();
    if ("cached" in doc) {
      renderResult(doc.cached, doc.source);
      return;
    }
    const cached = doc.url ? await getCachedScan(doc.url) : null;
    if (cached) {
      renderResult(cached, doc.source);
      return;
    }
    const active = activeConnection(await getSettings());
    if (!active) {
      showError("Connect an AI model in Settings to scan policies.");
      return;
    }
    setStatus("Reading the small print…");
    const scan = await analyzeDocument({ ...active, text: doc.text, url: doc.url, title: doc.title, signal });
    if (doc.url) await putCachedScan(doc.url, scan);
    renderResult(scan, doc.source);
  } catch (err) {
    // Cancelled: whatever was in flight (page read, download, API call) is discarded quietly.
    if (signal.aborted) return;
    showError(err instanceof ScanError || err instanceof FetchError ? err.message : "Something went wrong. Try again.");
    if (!(err instanceof ScanError || err instanceof FetchError)) console.error(err);
  } finally {
    controller = null;
    setBusy(false);
  }
}

function setBusy(busy: boolean): void {
  ui.status.hidden = !busy;
  ui.scanPaste.disabled = busy;
  ui.linkSubmit.disabled = busy;
  ui.scanPage.disabled = busy || !isWebUrl(activeTab?.url);
}
const setStatus = (text: string) => void (ui.statusText.textContent = text);
function showError(message: string): void {
  ui.error.textContent = message;
  ui.error.hidden = false;
}
const hideError = () => void (ui.error.hidden = true);
function clearResult(): void {
  shown = null;
  ui.result.hidden = true;
  ui.result.replaceChildren();
}

// ---------- rendering (text only, via textContent: document content is untrusted) ----------

function renderResult(scan: Scan, source: Source): void {
  shown = source;
  ui.result.replaceChildren(...resultNodes(scan));
  ui.result.hidden = false;
}

function resultNodes(scan: Scan): Node[] {
  if (scan.document_type === "not_a_policy") {
    return [el("div", { class: "card" }, el("div", { class: "flag-title" }, "This doesn't look like a policy"), el("p", { class: "muted" }, scan.verdict_reason))];
  }

  const counts = { red: 0, amber: 0, green: 0 };
  for (const f of scan.flags) counts[f.severity]++;
  const nodes: Node[] = [
    el("div", { class: "result-head" },
      el("div", { class: "doc-meta" }, DOC_TYPES[scan.document_type], scan.url ? ` · ${siteOf(scan.url)}` : null),
      el("h2", { class: "doc-name" }, scan.service_name || scan.title || "Untitled"),
      el("span", { class: `verdict ${scan.verdict}` }, VERDICTS[scan.verdict]),
      el("div", { class: "muted small" }, scan.verdict_reason),
      el("div", { class: "counts" },
        el("span", {}, el("b", {}, String(counts.red)), " red"),
        el("span", {}, el("b", {}, String(counts.amber)), " amber"),
        el("span", {}, el("b", {}, String(counts.green)), " good"))),
  ];

  if (scan.tldr.length > 0) {
    nodes.push(el("h3", {}, "What you're signing up for"), el("ul", { class: "tldr" }, scan.tldr.map((t) => el("li", {}, t))));
  }
  if (scan.flags.length > 0) {
    nodes.push(el("h3", {}, "Flagged clauses"), el("div", { class: "flags" }, scan.flags.map((f) => flagNode(f, scan.url))));
  }
  if (scan.opt_outs.length > 0) {
    nodes.push(el("h3", {}, "What you can do"), el("ul", { class: "optouts" }, scan.opt_outs.map((o) =>
      el("li", {},
        el("div", { class: "act" }, o.action),
        el("div", { class: "muted small" }, o.how),
        isHttpUrl(o.url) ? el("a", { href: o.url, target: "_blank", rel: "noopener noreferrer", class: "small" }, "Open link") : null))));
  }

  const dropped = scan.droppedFlags;
  nodes.push(el("div", { class: "footnote" },
    el("div", {}, "Every quote above was checked against the document." +
      (dropped ? ` ${dropped} flag${dropped === 1 ? " was" : "s were"} dropped because the quote didn't match.` : "")),
    scan.truncated ? el("div", {}, "This document was very long, so only the first part was analysed.") : null,
    el("div", {}, scanDetails(scan)),
    el("button", { class: "rescan", type: "button", onclick: () => void forget(scan) }, "Clear result")));
  return nodes;
}

function scanDetails(scan: Scan): string {
  const when = `Scanned ${new Date(scan.scannedAt).toLocaleString()} with ${scan.model}${scan.provider ? ` (${scan.provider})` : ""}`;
  return scan.costUsd === null ? `${when}.` : `${when} · about $${scan.costUsd.toFixed(3)} on your key.`;
}

/** Hides the result and removes it from the saved scans, so the next scan is fresh. */
async function forget(scan: Scan): Promise<void> {
  clearResult();
  if (scan.url) await removeCachedScan(scan.url);
}

function flagNode(f: Flag, url: string): HTMLElement {
  return el("article", { class: `flag ${f.severity}` },
    el("div", { class: "flag-top" },
      el("span", { class: "flag-title" }, f.title),
      el("span", { class: `sev ${f.severity}` }, f.severity === "green" ? "good" : f.severity)),
    el("div", { class: "flag-cat" }, CATEGORIES[f.category]),
    el("p", {}, f.explanation),
    el("blockquote", { class: "quote" }, `“${f.quote}”`),
    url ? el("button", { class: "show-link", type: "button", onclick: () => void showQuote(f.quote, url) }, "Show in document →") : null);
}

async function showQuote(quote: string, url: string): Promise<void> {
  const tab = activeTab;
  if (tab?.id !== undefined && isWebUrl(tab.url) && documentKey(tab.url) === url) {
    try {
      const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [quote], func: findOnPage });
      if (injection?.result) return;
    } catch {
      // Fall through to opening the document in a new tab.
    }
  }
  // Let Chrome scroll to the text: https://wicg.github.io/scroll-to-text-fragment/
  const start = quote.replace(/\s+/g, " ").trim().split(" ").slice(0, 8).join(" ");
  void chrome.tabs.create({ url: `${url}#:~:text=${encodeURIComponent(start)}` });
}

/** Runs inside the page: selects the quote and scrolls to it. Must be self-contained. */
function findOnPage(quote: string): boolean {
  const words = quote.replace(/[“”"]/g, "").replace(/\s+/g, " ").trim().split(" ");
  // window.find is non-standard but supported in Chrome, and matches across element boundaries.
  const find = (window as Window & { find?: (s: string, caseSensitive: boolean, backwards: boolean, wrap: boolean) => boolean }).find;
  if (!find) return false;
  for (const n of [12, 8, 5]) {
    const needle = words.slice(0, n).join(" ");
    window.getSelection()?.removeAllRanges();
    if (needle && find.call(window, needle, false, false, true)) {
      const node = window.getSelection()?.getRangeAt(0).startContainer.parentElement;
      node?.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    }
  }
  return false;
}

function isHttpUrl(u: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(u).protocol);
  } catch {
    return false;
  }
}

void refresh();
