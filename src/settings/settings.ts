import { testApiKey } from "../lib/analyze";
import { el, mustGet } from "../lib/dom";
import { getSettings, setSettings } from "../lib/storage";

const ui = {
  form: mustGet("key-form", HTMLFormElement),
  key: mustGet("api-key", HTMLInputElement),
  save: mustGet("save-key", HTMLButtonElement),
  status: mustGet("key-status"),
  remove: mustGet("remove-key", HTMLButtonElement),
  autoReject: mustGet("auto-reject", HTMLInputElement),
  paused: mustGet("paused", HTMLUListElement),
  noPaused: mustGet("no-paused"),
  clearCache: mustGet("clear-cache", HTMLButtonElement),
};

function setStatus(text: string, tone: "ok" | "bad" | "" = ""): void {
  ui.status.textContent = text;
  ui.status.className = `small ${tone || "muted"}`;
}

async function render(): Promise<void> {
  const s = await getSettings();
  ui.remove.hidden = !s.apiKey;
  ui.key.placeholder = s.apiKey ? `Saved (…${s.apiKey.slice(-4)})` : "sk-ant-…";
  if (s.apiKey && !ui.status.textContent) setStatus("A key is saved.");
  ui.autoReject.checked = s.autoReject;
  ui.noPaused.hidden = s.pausedSites.length > 0;
  ui.paused.replaceChildren(
    ...s.pausedSites.map((site) =>
      el("li", {}, site, el("button", { class: "btn link", type: "button", onclick: () => void unpause(site) }, "Resume"))),
  );
}

ui.form.addEventListener("submit", (e) => {
  e.preventDefault();
  void saveKey();
});

async function saveKey(): Promise<void> {
  const key = ui.key.value.trim();
  if (!key) {
    setStatus("Paste a key first.", "bad");
    return;
  }
  ui.save.disabled = true;
  setStatus("Checking with Anthropic…");
  try {
    await testApiKey(key);
    await setSettings({ apiKey: key });
    ui.key.value = "";
    setStatus("Key works and is saved.", "ok");
  } catch (err) {
    setStatus(err instanceof Error ? err.message : "That key didn't work.", "bad");
  } finally {
    ui.save.disabled = false;
    void render();
  }
}

ui.remove.addEventListener("click", () => {
  void setSettings({ apiKey: "" }).then(() => {
    setStatus("Key removed.");
    return render();
  });
});

ui.autoReject.addEventListener("change", () => void setSettings({ autoReject: ui.autoReject.checked }));

async function unpause(site: string): Promise<void> {
  const { pausedSites } = await getSettings();
  await setSettings({ pausedSites: pausedSites.filter((s) => s !== site) });
  void render();
}

ui.clearCache.addEventListener("click", () => {
  void chrome.storage.local.remove("scanCache").then(() => {
    ui.clearCache.textContent = "Cleared";
    ui.clearCache.disabled = true;
  });
});

void render();
