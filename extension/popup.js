(() => {
  "use strict";
  const Core = globalThis.ShadeCore;
  const UI = globalThis.ShadeUI;
  const $ = id => document.getElementById(id);
  const media = matchMedia("(prefers-color-scheme: dark)");
  let settings = Core.normalizeSettings();
  let tab;
  let host = "";
  let supported = false;
  let refreshGeneration = 0;

  function renderSettings() {
    $("enabled").setAttribute("aria-checked", String(settings.enabled));
    $("filter-preset").value = settings.filterPreset;
    $("reset-preset").hidden = settings.filterPreset === "balanced";
    document.querySelectorAll("[data-mode]").forEach(button => button.setAttribute("aria-pressed", String(settings.mode === button.dataset.mode)));
    $("mode-note").textContent = {
      system: "系统深色时统一反色；系统浅色时恢复原貌。",
      dark: "持续使用统一反色；已经是深色的页面默认跳过。",
      light: "撤销插件变换；不改变网站自己的主题设置。"
    }[settings.mode];
    const rule = settings.sites[host] || {};
    $("site-mode").value = rule.mode || "inherit";
    $("force").checked = !!rule.force;
    $("site-mode").disabled = !supported;
    $("force").disabled = !supported;
    $("reset-site").hidden = !supported || !settings.sites[host];
    $("system-label").textContent = `系统 · ${media.matches ? "深色" : "浅色"}`;
  }

  function renderStatus(status) {
    const [title, description] = UI.reasons[status.reason] || UI.reasons.unavailable;
    $("status-title").textContent = title;
    $("status-description").textContent = status.reason === "converted"
      ? `${status.filterPreset === "dim" ? "低亮" : "均衡"}效果 · 文字、背景与图片统一变换。` : description;
    document.querySelector(".status-card").dataset.reason = status.reason;
    const result = status.detection || {};
    const signals = (result.signals || []).map(signal => UI.signalNames[signal]).filter(Boolean);
    $("detection-detail").textContent = supported
      ? `${result.isDark ? "页面主体已呈深色。" : "页面主体未识别为深色。"}检查了 ${result.samples || 0} 个取样点${result.unknownSamples ? `，其中 ${result.unknownSamples} 个由图片等合成，不能确定明暗` : ""}。${signals.length ? `辅助线索：${signals.join("、")}。` : ""}可强制反色或恢复本站原貌。`
      : "仅支持已授权的 HTTP / HTTPS 普通网页，不支持浏览器内部页、扩展商店、本地文件和内置 PDF 阅读器。";
    $("warning").textContent = status.warning || "";
    $("warning").hidden = !status.warning;
  }

  async function refreshStatus(ensure = false) {
    const token = ++refreshGeneration;
    if (!supported) { renderStatus({ reason: "restricted" }); return; }
    try {
      if (ensure) {
        const response = await chrome.runtime.sendMessage({ type: "SHADE_ENSURE", tabId: tab.id });
        if (!response?.ok) throw new Error(response?.error);
      }
      let status;
      for (let attempt = 0; attempt < 10; attempt++) {
        status = await chrome.tabs.sendMessage(tab.id, { type: "SHADE_STATUS" }, { frameId: 0 });
        if (status?.reason !== "loading") break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (token === refreshGeneration) renderStatus(status || { reason: "unavailable" });
    } catch {
      if (token === refreshGeneration) renderStatus({ reason: "unavailable" });
    }
  }

  async function save(patch) {
    try {
      UI.error();
      settings = await UI.patch(patch);
      renderSettings();
      // Let content scripts observe the storage change before querying status.
      await new Promise(resolve => setTimeout(resolve, 100));
      await refreshStatus();
    } catch (error) { UI.error(error.message); }
  }

  $("enabled").addEventListener("click", () => save({ action: "global", enabled: !settings.enabled }));
  $("filter-preset").addEventListener("change", event => save({ action: "global", filterPreset: event.target.value }));
  $("reset-preset").addEventListener("click", () => save({ action: "global", filterPreset: "balanced" }));
  document.querySelectorAll("[data-mode]").forEach(button => button.addEventListener("click", () => save({ action: "global", mode: button.dataset.mode })));
  $("site-mode").addEventListener("change", event => save({ action: "site", host, mode: event.target.value }));
  $("force").addEventListener("change", event => save({ action: "site", host, force: event.target.checked }));
  $("reset-site").addEventListener("click", () => save({ action: "site", host, reset: true }));
  $("options").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("recheck").addEventListener("click", async () => {
    if (!supported) return;
    $("recheck").disabled = true;
    try {
      UI.error();
      const status = await chrome.tabs.sendMessage(tab.id, { type: "SHADE_RECHECK" }, { frameId: 0 });
      renderStatus(status);
    } catch { await refreshStatus(true); }
    finally { $("recheck").disabled = false; }
  });
  media.addEventListener("change", () => {
    renderSettings();
    setTimeout(() => refreshStatus(), 700);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[Core.KEY]) {
      settings = Core.normalizeSettings(changes[Core.KEY].newValue);
      renderSettings();
      setTimeout(() => refreshStatus(), 150);
    }
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === "SHADE_STATUS_UPDATED" && message.tabId === tab?.id) refreshStatus();
    return false;
  });

  (async () => {
    try {
      settings = await UI.read();
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      supported = !!tab && Core.isWebURL(tab.url);
      host = supported ? Core.siteKey(tab.url) : "";
      $("hostname").textContent = host || "不支持的页面";
      $("hostname").title = host;
      $("recheck").disabled = !supported;
      renderSettings();
      await refreshStatus(true);
    } catch (error) { UI.error(error.message); }
  })();
})();
