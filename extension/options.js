(() => {
  "use strict";
  const Core = globalThis.ShadeCore;
  const UI = globalThis.ShadeUI;
  const $ = id => document.getElementById(id);
  let settings = Core.normalizeSettings();
  const modeNames = { system: "跟随系统", dark: "始终深色", off: "恢复原貌" };
  function render() {
    $("enabled").checked = settings.enabled;
    $("global-mode").value = settings.mode;
    $("filter-preset").value = settings.filterPreset;
    $("protect-native").checked = settings.protectNative;
    const entries = Object.entries(settings.sites).sort(([a], [b]) => a.localeCompare(b));
    $("site-count").textContent = String(entries.length);
    $("empty-sites").hidden = entries.length > 0;
    $("sites").replaceChildren(...entries.map(([host, rule]) => {
      const row = document.createElement("div");
      row.className = "saved-site";
      const text = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = host;
      const detail = document.createElement("small");
      detail.textContent = `${modeNames[rule.mode] || "跟随全局"}${rule.force ? " · 强制反色" : ""}`;
      text.append(name, detail);
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "text-button";
      reset.textContent = "恢复全局";
      reset.setAttribute("aria-label", `清除 ${host} 的例外`);
      reset.addEventListener("click", () => save({ action: "site", host, reset: true }));
      row.append(text, reset);
      return row;
    }));
  }
  async function save(patch) {
    try { UI.error(); settings = await UI.patch(patch); render(); }
    catch (error) { UI.error(error.message); }
  }
  $("enabled").addEventListener("change", event => save({ action: "global", enabled: event.target.checked }));
  $("global-mode").addEventListener("change", event => save({ action: "global", mode: event.target.value }));
  $("filter-preset").addEventListener("change", event => save({ action: "global", filterPreset: event.target.value }));
  $("protect-native").addEventListener("change", event => save({ action: "global", protectNative: event.target.checked }));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[Core.KEY]) { settings = Core.normalizeSettings(changes[Core.KEY].newValue); render(); }
  });
  UI.read().then(value => { settings = value; render(); }).catch(error => UI.error(error.message));
})();
