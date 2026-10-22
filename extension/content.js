(() => {
  "use strict";
  if (window !== window.top || globalThis.__systemShadeController) return;
  globalThis.__systemShadeController = true;
  const Core = globalThis.ShadeCore;
  const Detector = globalThis.ShadeDetector;
  const media = matchMedia("(prefers-color-scheme: dark)");
  const root = document.documentElement;
  const preservation = globalThis.ShadeMedia.create(root);
  const ATTR = "data-system-shade";
  const CANVAS = "data-system-shade-canvas";
  const PRESET = "data-system-shade-preset";
  let settings = Core.normalizeSettings();
  const host = Core.siteKey(location.href);
  let initialized = false;
  let applied = false;
  let detection = {};
  let timer;
  let lastProbe = 0;
  let followups = [];
  let state = { reason: "loading", mode: "system", host, systemDark: media.matches, detection };

  function report() {
    chrome.runtime.sendMessage({ type: "SHADE_REPORT", reason: state.reason }).catch(() => {});
  }

  function reconcile() {
    if (!initialized || !document.body) return;
    const decision = Core.decide(settings, host, media.matches, detection);
    applied = decision.apply;
    root.toggleAttribute(CANVAS, applied && detection.transparentCanvas);
    if (applied) {
      root.setAttribute(PRESET, settings.filterPreset);
      root.setAttribute(ATTR, "on");
    } else {
      root.removeAttribute(ATTR);
      root.removeAttribute(PRESET);
    }
    preservation.setEnabled(applied && settings.preserveMedia);
    state = { ...decision, host, systemDark: media.matches, filterPreset: settings.filterPreset, preserveMedia: settings.preserveMedia, detection, warning: "" };
    // Never claim success when an author inline !important filter blocks us.
    if (applied && matchMedia("screen").matches && !getComputedStyle(root).filter.includes("invert(1)")) {
      root.removeAttribute(ATTR);
      root.removeAttribute(CANVAS);
      root.removeAttribute(PRESET);
      preservation.setEnabled(false);
      applied = false;
      state = { ...state, apply: false, reason: "error", warning: "网站覆盖了根元素滤镜，请将本站恢复原貌。" };
    }
    report();
  }

  function probe() {
    if (!initialized || !document.body) return state;
    clearTimeout(timer);
    // Read originals and restore our switch in the SAME task: no await/frame
    // and no visibly unfiltered intermediate paint during theme rechecks.
    root.removeAttribute(ATTR);
    root.removeAttribute(CANVAS);
    root.removeAttribute(PRESET);
    try { detection = Detector.detect(); }
    catch { detection = { isDark: false, signals: [], samples: 0, transparentCanvas: false }; }
    lastProbe = Date.now();
    reconcile();
    return state;
  }

  function schedule(delay = 120) {
    if (!initialized || !document.body) return;
    clearTimeout(timer);
    timer = setTimeout(probe, Math.max(delay, 350 - (Date.now() - lastProbe)));
  }

  function settledProbe() {
    schedule(0);
    followups.forEach(clearTimeout);
    followups = [500, 1500].map(delay => setTimeout(() => schedule(0), delay));
  }

  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type === "SHADE_STATUS") { respond(state); return false; }
    if (message?.type === "SHADE_RECHECK") { respond(probe()); return false; }
    return false;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[Core.KEY]) return;
    settings = Core.normalizeSettings(changes[Core.KEY].newValue);
    probe();
  });
  media.addEventListener("change", settledProbe);
  document.addEventListener("DOMContentLoaded", settledProbe, { once: true });
  window.addEventListener("load", settledProbe, { once: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(); });
  window.addEventListener("focus", () => schedule());
  document.addEventListener("transitionend", event => {
    if ([root, document.body].includes(event.target) && ["background-color", "color"].includes(event.propertyName)) schedule();
  }, true);
  window.addEventListener("pageshow", event => {
    if (event.persisted) chrome.storage.local.get(Core.KEY).then(data => {
      settings = Core.normalizeSettings(data[Core.KEY]); probe();
    }).catch(() => {});
  });

  const observer = new MutationObserver(records => {
    if (!initialized) return;
    const relevant = records.some(record => {
      const target = record.target;
      if (record.type === "attributes") {
        return target === root || target === document.body ||
          target.matches?.("#app, #root, #__next, main, [data-theme], [data-color-mode], [data-bs-theme]");
      }
      if (target.nodeName === "STYLE") return true;
      return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
        (node.matches("body, style, link[rel='stylesheet'], #app, #root, #__next, main") ||
          node.querySelector("style, link[rel='stylesheet']")));
    });
    if (relevant) schedule();
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true,
    attributeFilter: ["class", "style", "data-theme", "data-color-mode", "data-bs-theme", "data-mode"] });

  chrome.storage.local.get(Core.KEY).then(data => {
    settings = Core.normalizeSettings(data[Core.KEY]);
    initialized = true;
    if (root.tagName !== "HTML") {
      state = { ...state, reason: "unsupported-document" }; report(); return;
    }
    probe();
  }).catch(() => {
    state = { ...state, reason: "error", warning: "扩展连接已失效，请刷新网页。" }; report();
  });
})();
