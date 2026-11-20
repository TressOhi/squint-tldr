// Settings page: which AI provider and model scans use, cookie options, privacy.
// Everything provider-specific comes from the provider data; this page only renders it.
import { createClient, type ModelOption } from "../../core/llm";
import { findProvider, PROVIDERS, type Connection, type ProviderInfo } from "../../core/llm/providers";
import { el, mustGet } from "../dom";
import { connectionFor, getSettings, saveConnection, setSettings } from "../../platform/storage";

const ui = {
  provider: mustGet("provider", HTMLSelectElement),
  providerNote: mustGet("provider-note"),
  form: mustGet("connect-form", HTMLFormElement),
  endpointField: mustGet("endpoint-field"),
  baseUrl: mustGet("base-url", HTMLInputElement),
  keyField: mustGet("key-field"),
  keyLabel: mustGet("key-label"),
  key: mustGet("api-key", HTMLInputElement),
  connect: mustGet("connect", HTMLButtonElement),
  statusRow: mustGet("status-row"),
  status: mustGet("key-status"),
  remove: mustGet("remove-key", HTMLButtonElement),
  keyHelp: mustGet("key-help"),
  keyLink: mustGet("key-link", HTMLAnchorElement),
  modelField: mustGet("model-field"),
  model: mustGet("model", HTMLSelectElement),
  autoReject: mustGet("auto-reject", HTMLInputElement),
  paused: mustGet("paused", HTMLUListElement),
  noPaused: mustGet("no-paused"),
  clearCache: mustGet("clear-cache", HTMLButtonElement),
};

ui.provider.append(...PROVIDERS.map((p) => el("option", { value: p.id }, p.name)));

function setStatus(text: string, tone: "ok" | "bad" | "" = ""): void {
  ui.statusRow.hidden = !text && ui.remove.hidden;
  ui.status.textContent = text;
  ui.status.className = `small ${tone || "muted"}`;
}

const selectedProvider = (): ProviderInfo | undefined => findProvider(ui.provider.value);

// ---------- provider and connection ----------

async function renderProvider(): Promise<void> {
  const provider = selectedProvider();
  ui.providerNote.hidden = !provider?.note;
  ui.providerNote.textContent = provider?.note ?? "";
  ui.form.hidden = !provider;
  ui.keyHelp.hidden = !provider?.keyUrl;
  ui.modelField.hidden = true;
  if (!provider) {
    setStatus("");
    return;
  }

  const conn = connectionFor(await getSettings(), provider);
  const editableEndpoint = provider.local === true || !provider.baseUrl;
  ui.endpointField.hidden = !editableEndpoint;
  ui.baseUrl.value = conn.baseUrl;
  ui.baseUrl.placeholder = provider.baseUrl || "https://your-server.example/v1";

  ui.keyField.hidden = provider.key === "none";
  ui.keyLabel.textContent = provider.key === "optional" ? "API key (if your server needs one)" : "API key";
  ui.key.value = "";
  ui.key.placeholder = conn.apiKey ? `Saved (…${conn.apiKey.slice(-4)})` : (provider.keyPlaceholder ?? "");
  ui.remove.hidden = !conn.apiKey;
  if (provider.keyUrl) {
    ui.keyLink.href = provider.keyUrl;
    ui.keyLink.textContent = new URL(provider.keyUrl).hostname;
  }

  if (conn.model) {
    renderModels([{ id: conn.model, label: conn.model }], conn.model);
    setStatus(`Using ${conn.model}.`);
    // Fill in the full list quietly; listing models is free.
    void listModels(provider, conn).then((models) => {
      if (models && selectedProvider() === provider) renderModels(models, conn.model);
    });
  } else {
    setStatus(conn.apiKey ? "A key is saved. Save and test to choose a model." : "");
  }
}

function renderModels(models: readonly ModelOption[], selected: string): void {
  const options = models.some((m) => m.id === selected) || !selected ? models : [{ id: selected, label: selected }, ...models];
  ui.model.replaceChildren(...options.map((m) => el("option", { value: m.id }, m.label === m.id ? m.id : `${m.label} (${m.id})`)));
  ui.model.value = selected;
  ui.modelField.hidden = options.length === 0;
}

async function listModels(provider: ProviderInfo, conn: Connection): Promise<ModelOption[] | null> {
  try {
    return await (await createClient(provider, conn)).listModels();
  } catch {
    return null;
  }
}

ui.provider.addEventListener("change", () => {
  void setSettings({ provider: ui.provider.value }).then(renderProvider);
});

ui.form.addEventListener("submit", (e) => {
  e.preventDefault();
  void connect();
});

async function connect(): Promise<void> {
  const provider = selectedProvider();
  if (!provider) return;
  const saved = connectionFor(await getSettings(), provider);
  const conn: Connection = { ...saved, apiKey: ui.key.value.trim() || saved.apiKey, baseUrl: ui.baseUrl.value.trim() };
  if (provider.key === "required" && !conn.apiKey) {
    setStatus("Paste a key first.", "bad");
    return;
  }
  if (!provider.baseUrl && !conn.baseUrl) {
    setStatus("Enter the server address first.", "bad");
    return;
  }

  ui.connect.disabled = true;
  setStatus(`Checking with ${provider.name}…`);
  try {
    const models = await (await createClient(provider, conn)).listModels();
    if (models.length === 0) {
      setStatus(`${provider.name} didn't list any models.${provider.local ? " Download one first." : ""}`, "bad");
      return;
    }
    const ids = new Set(models.map((m) => m.id));
    const model = [conn.model, provider.defaultModel].find((m) => m && ids.has(m)) ?? (models[0] as ModelOption).id;
    await saveConnection(provider, { ...conn, model });
    await renderProvider();
    renderModels(models, model);
    setStatus(`Connected. ${models.length} model${models.length === 1 ? "" : "s"} available.`, "ok");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "That didn't work.", "bad");
  } finally {
    ui.connect.disabled = false;
  }
}

ui.model.addEventListener("change", () => {
  const provider = selectedProvider();
  if (!provider) return;
  void getSettings().then(async (s) => {
    await saveConnection(provider, { ...connectionFor(s, provider), model: ui.model.value });
    setStatus(`Using ${ui.model.value}.`, "ok");
  });
});

ui.remove.addEventListener("click", () => {
  const provider = selectedProvider();
  if (!provider) return;
  void getSettings().then(async (s) => {
    await saveConnection(provider, { ...connectionFor(s, provider), apiKey: "" });
    await renderProvider();
    setStatus("Key removed.");
  });
});

// ---------- cookies and privacy ----------

async function renderCookies(): Promise<void> {
  const s = await getSettings();
  ui.autoReject.checked = s.autoReject;
  ui.noPaused.hidden = s.pausedSites.length > 0;
  ui.paused.replaceChildren(
    ...s.pausedSites.map((site) =>
      el("li", {}, site, el("button", { class: "btn link", type: "button", onclick: () => void unpause(site) }, "Resume"))),
  );
}

ui.autoReject.addEventListener("change", () => void setSettings({ autoReject: ui.autoReject.checked }));

async function unpause(site: string): Promise<void> {
  const { pausedSites } = await getSettings();
  await setSettings({ pausedSites: pausedSites.filter((s) => s !== site) });
  void renderCookies();
}

ui.clearCache.addEventListener("click", () => {
  void chrome.storage.local.remove("scanCache").then(() => {
    ui.clearCache.textContent = "Cleared";
    ui.clearCache.disabled = true;
  });
});

void getSettings().then((s) => {
  ui.provider.value = findProvider(s.provider) ? s.provider : "";
  void renderProvider();
  void renderCookies();
});
