importScripts("core.js");
const Core = globalThis.ShadeCore;
let settingsQueue = Promise.resolve();

async function readSettings() {
  const data = await chrome.storage.local.get(Core.KEY);
  return Core.normalizeSettings(data[Core.KEY]);
}
function trustedUI(sender) {
  return sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(""));
}
async function ensureContent(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!Core.isWebURL(tab.url)) return { ok: false, error: "此页面不允许扩展修改" };
  try {
    const status = await chrome.tabs.sendMessage(tabId, { type: "SHADE_STATUS" }, { frameId: 0 });
    if (status) return { ok: true };
  } catch { /* Connect pages opened before installation when the popup opens. */ }
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["engine.css"] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["core.js", "detector.js", "media.js", "content.js"] });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || typeof message.type !== "string" || !message.type.startsWith("SHADE_")) return false;
  const handle = async () => {
    if (message.type === "SHADE_PATCH" && trustedUI(sender)) {
      const operation = settingsQueue.then(async () => {
        const settings = Core.patchSettings(await readSettings(), message.patch || {});
        await chrome.storage.local.set({ [Core.KEY]: settings });
        return { ok: true, settings };
      });
      settingsQueue = operation.catch(() => {});
      return operation;
    }
    if (message.type === "SHADE_ENSURE" && trustedUI(sender) && Number.isInteger(message.tabId)) return ensureContent(message.tabId);
    if (message.type === "SHADE_REPORT" && sender.tab && sender.frameId === 0) {
      const reason = message.reason;
      const text = reason === "converted" ? "ON" : reason === "native-dark" ? "原" : reason === "error" ? "!" : "";
      await chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: reason === "error" ? "#a11b1b" : "#404040" });
      await chrome.action.setBadgeText({ tabId: sender.tab.id, text });
      chrome.runtime.sendMessage({ type: "SHADE_STATUS_UPDATED", tabId: sender.tab.id }).catch(() => {});
      return { ok: true };
    }
    return { ok: false, error: "不支持的请求" };
  };
  handle().then(respond, error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.runtime.onInstalled.addListener(() => {
  settingsQueue = settingsQueue.then(async () => {
    await chrome.storage.local.set({ [Core.KEY]: await readSettings() });
  });
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading") chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
});
