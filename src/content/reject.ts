// Finds a cookie banner in a document and picks the most private option.
// No extension APIs here, so this runs as-is in tests against fixture pages.
//
// Order: known consent tools first (precise selectors), then any banner-shaped element whose
// buttons say "Reject all" or similar. It never clicks anything that accepts.
import { CMPS, type Cmp } from "./cmps";

export interface RejectOutcome {
  cmp: string;
  method: "reject_all" | "settings";
  switched: number;
}

export interface RejectOptions {
  /** True when running inside a consent iframe: the whole frame counts as the banner. */
  consentFrame?: boolean;
  /** How long to wait for a preferences panel to open. */
  settleMs?: number;
}

const REJECT_PHRASES = [
  "reject( all)?( cookies)?",
  "reject (all )?(optional|non[- ]?essential|additional) cookies",
  "decline( all)?( cookies)?",
  "decline (optional|non[- ]?essential) cookies",
  "deny( all)?( cookies)?",
  "refuse( all)?( cookies)?",
  "disagree( and close)?",
  "i (do not|don't) (accept|agree)",
  "(use|allow|accept) (only )?(strictly )?(necessary|essential|required)( cookies)?( only)?",
  "only (strictly )?(necessary|essential|required)( cookies)?",
  "(strictly )?(necessary|essential|required)( cookies)? only",
  "continue without (accepting|agreeing|consent)",
  "do not consent",
  // Other languages
  "alle ablehnen", "ablehnen", "nur notwendige( cookies)?", "tout refuser", "refuser( tout)?",
  "continuer sans accepter", "rechazar( todo| todas)?", "rifiuta( tutto)?", "alles weigeren", "weigeren",
  "rejeitar( tudo)?", "recusar", "odrzuć( wszystkie)?", "avvisa alla", "afvis alle", "hylkää kaikki",
];
export const REJECT_LABEL = new RegExp(`^(${REJECT_PHRASES.join("|")})[.!]?$`, "iu");
const ACCEPTS = /\b(accept|agree|allow all|got it|okay)\b|^ok$/i;
const STILL_REJECTS = /without|do not|don't|necessary|essential|required/i;
const BANNER_WORDS = /cookie|consent|gdpr|tracking technolog|trackers|datenschutz/i;

export function isRejectLabel(label: string): boolean {
  const text = label.replace(/\s+/g, " ").trim();
  if (!text || text.length > 60 || !REJECT_LABEL.test(text)) return false;
  return !ACCEPTS.test(text) || STILL_REJECTS.test(text);
}

export async function tryReject(doc: Document, opts: RejectOptions = {}): Promise<RejectOutcome | null> {
  for (const cmp of CMPS) {
    const outcome = await tryCmp(doc, cmp, opts.settleMs ?? 700);
    if (outcome) return outcome;
  }

  if (opts.consentFrame) {
    const btn = findRejectButton(doc.body);
    if (!btn) return null;
    click(btn);
    return { cmp: doc.location.hostname, method: "reject_all", switched: 0 };
  }

  for (const banner of findBanners(doc)) {
    const btn = findRejectButton(banner);
    if (btn) {
      click(btn);
      return { cmp: "generic", method: "reject_all", switched: 0 };
    }
  }
  return null;
}

async function tryCmp(doc: Document, cmp: Cmp, settleMs: number): Promise<RejectOutcome | null> {
  const root: ParentNode | null | undefined = cmp.shadowHost ? doc.querySelector(cmp.shadowHost)?.shadowRoot : doc;
  if (!root) return null;
  const container = root.querySelector(cmp.detect);
  if (!container || !isVisible(container)) return null;

  const direct = firstVisible(root, cmp.reject) ?? findRejectButton(container);
  if (direct) {
    click(direct);
    return { cmp: cmp.name, method: "reject_all", switched: 0 };
  }
  if (cmp.settings && cmp.save) return rejectViaSettings(root, cmp, cmp.settings, cmp.save, settleMs);
  return null;
}

/** Opens "manage preferences", switches off every optional category and saves. */
async function rejectViaSettings(
  root: ParentNode,
  cmp: Cmp,
  settings: string,
  save: string[],
  settleMs: number,
): Promise<RejectOutcome | null> {
  const open = firstVisible(root, [settings]);
  if (!open) return null;
  click(open);
  await sleep(settleMs);

  const panel = (cmp.panel ? root.querySelector(cmp.panel) : null) ?? root;
  const panelReject = firstVisible(panel, cmp.reject) ?? findRejectButton(panel);
  if (panelReject) {
    click(panelReject);
    return { cmp: cmp.name, method: "reject_all", switched: 0 };
  }

  let switched = 0;
  for (const box of panel.querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked:not(:disabled)")) {
    box.click();
    if (!box.checked) switched++;
  }
  for (const sw of panel.querySelectorAll<HTMLElement>("[role=switch][aria-checked=true]:not([aria-disabled=true])")) {
    sw.click();
    if (sw.getAttribute("aria-checked") !== "true") switched++;
  }
  const saveBtn = firstVisible(panel, save);
  if (!saveBtn) return null;
  click(saveBtn);
  return { cmp: cmp.name, method: "settings", switched };
}

const BANNER_SELECTOR = [
  "[role=dialog]", "[role=alertdialog]", "[aria-modal=true]", "[aria-label*=cookie i]", "[aria-label*=consent i]",
  "[id*=cookie i]", "[class*=cookie i]", "[id*=consent i]", "[class*=consent i]", "[id*=gdpr i]", "[class*=gdpr i]",
].join(",");

export function findBanners(doc: Document): Element[] {
  const found = new Set<Element>();
  for (const root of [doc, ...openShadowRoots(doc)]) {
    for (const el of root.querySelectorAll(BANNER_SELECTOR)) found.add(el);
  }
  // Fixed or sticky boxes at the top level are often banners too.
  for (const el of doc.body.children) {
    const { position } = getComputedStyle(el);
    if (position === "fixed" || position === "sticky") found.add(el);
  }
  return [...found].filter((el) => {
    if (!isVisible(el)) return false;
    const text = el instanceof HTMLElement ? el.innerText : el.textContent;
    return text.length > 20 && text.length < 6000 && BANNER_WORDS.test(text);
  });
}

export function findRejectButton(scope: ParentNode): HTMLElement | null {
  const candidates = scope.querySelectorAll<HTMLElement>("button, [role=button], input[type=button], input[type=submit], a");
  for (const el of candidates) {
    if (!isVisible(el)) continue;
    if (el instanceof HTMLAnchorElement && !isInPageLink(el)) continue;
    const label = el instanceof HTMLInputElement ? el.value : el.innerText || el.getAttribute("aria-label") || "";
    if (isRejectLabel(label)) return el;
  }
  return null;
}

/** Links that navigate somewhere else are never clicked. */
function isInPageLink(a: HTMLAnchorElement): boolean {
  if (a.getAttribute("role") === "button") return true;
  const href = a.getAttribute("href");
  return !href || href.startsWith("#") || href.startsWith("javascript:");
}

const MAX_SHADOW_SCAN = 5000;
function openShadowRoots(doc: Document): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  const all = doc.body.querySelectorAll("*");
  for (let i = 0; i < all.length && i < MAX_SHADOW_SCAN; i++) {
    const shadow = all[i]?.shadowRoot;
    if (shadow) roots.push(shadow);
  }
  return roots;
}

function firstVisible(root: ParentNode, selectors: readonly string[]): HTMLElement | null {
  for (const sel of selectors) {
    for (const el of root.querySelectorAll<HTMLElement>(sel)) if (isVisible(el)) return el;
  }
  return null;
}

function isVisible(el: Element): boolean {
  if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** Some consent tools listen for pointer or mouse events rather than "click". */
function click(el: HTMLElement): void {
  const init = { bubbles: true, cancelable: true, composed: true };
  el.dispatchEvent(new PointerEvent("pointerdown", init));
  el.dispatchEvent(new MouseEvent("mousedown", init));
  el.dispatchEvent(new PointerEvent("pointerup", init));
  el.dispatchEvent(new MouseEvent("mouseup", init));
  el.click();
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
