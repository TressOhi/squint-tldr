// Everything is stored locally in this browser profile. Nothing leaves it except the
// document text sent to the provider the user chose, using their own key.
import type { Scan } from "../core/analysis/schema";
import { emptyConnection, findProvider, isReady, type Connection, type ProviderInfo } from "../core/llm/providers";

export interface Settings {
  /** Id of the provider the user selected for scans; "" until they pick one. */
  provider: string;
  /** Key, model and endpoint per provider id, so switching back and forth keeps each setup. */
  connections: Partial<Record<string, Connection>>;
  autoReject: boolean;
  pausedSites: string[];
}

const DEFAULTS: Settings = { provider: "", connections: {}, autoReject: true, pausedSites: [] };

export async function getSettings(): Promise<Settings> {
  // Passing the defaults object returns stored values with defaults filled in.
  const stored = await chrome.storage.local.get<Settings>(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(patch);
}

/** The saved connection for a provider, or a blank one. */
export const connectionFor = (settings: Settings, provider: ProviderInfo): Connection =>
  settings.connections[provider.id] ?? emptyConnection(provider);

export async function saveConnection(provider: ProviderInfo, conn: Connection): Promise<void> {
  const { connections } = await getSettings();
  await setSettings({ connections: { ...connections, [provider.id]: conn } });
}

/** The selected provider and its connection, or null until the user has set one up. */
export function activeConnection(settings: Settings): { provider: ProviderInfo; connection: Connection } | null {
  const provider = findProvider(settings.provider);
  if (!provider) return null;
  const connection = settings.connections[provider.id];
  return isReady(provider, connection) ? { provider, connection } : null;
}

/** "www.example.com" → "example.com"; "" for anything that isn't a URL. */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** URL without its fragment, used as the cache key for a document. */
export const documentKey = (url: string): string => url.split("#")[0] ?? url;

// Recent scans, keyed by URL, so reopening a policy doesn't cost another scan.
const CACHE_KEY = "scanCache";
const CACHE_MAX = 25;
type ScanCache = Record<string, Scan>;

async function readCache(): Promise<ScanCache> {
  const stored = await chrome.storage.local.get<{ [CACHE_KEY]?: ScanCache }>(CACHE_KEY);
  return stored[CACHE_KEY] ?? {};
}

export async function getCachedScan(url: string): Promise<Scan | null> {
  return (await readCache())[url] ?? null;
}

export async function putCachedScan(url: string, scan: Scan): Promise<void> {
  const cache = await readCache();
  cache[url] = scan;
  const newestFirst = Object.entries(cache).sort(([, a], [, b]) => b.scannedAt - a.scannedAt);
  await chrome.storage.local.set({ [CACHE_KEY]: Object.fromEntries(newestFirst.slice(0, CACHE_MAX)) });
}

export async function removeCachedScan(url: string): Promise<void> {
  const cache = await readCache();
  if (!(url in cache)) return;
  await chrome.storage.local.set({ [CACHE_KEY]: Object.fromEntries(Object.entries(cache).filter(([key]) => key !== url)) });
}

// Per-tab cookie results, written by the background worker, read by the side panel.
export interface CookieResult {
  cmp: string;
  method: "reject_all" | "settings";
  switched: number;
  site: string;
  at: number;
}

export const tabKey = (tabId: number): string => `tab:${tabId}`;

export async function getTabCookieResult(tabId: number): Promise<CookieResult | null> {
  const stored = await chrome.storage.session.get<Record<string, { cookie?: CookieResult }>>(tabKey(tabId));
  return stored[tabKey(tabId)]?.cookie ?? null;
}
