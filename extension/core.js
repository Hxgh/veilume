/* Shared, pure policy. Classic script for MV3 workers, content scripts and UI. */
(() => {
  "use strict";
  const KEY = "systemShadeSettings";
  const MODES = ["system", "dark", "light"];
  const FILTER_PRESETS = ["balanced", "dim"];
  const SITE_MODES = ["inherit", "system", "dark", "off"];
  const DEFAULTS = Object.freeze({ version: 3, enabled: true, mode: "system", filterPreset: "balanced", protectNative: true, sites: {} });

  function isWebURL(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) &&
        url.hostname !== "chromewebstore.google.com" &&
        !(url.hostname === "chrome.google.com" && url.pathname.startsWith("/webstore"));
    } catch { return false; }
  }

  function siteKey(value) {
    try { return new URL(value).hostname.toLowerCase(); } catch { return ""; }
  }

  function normalizeSettings(raw) {
    const value = raw && typeof raw === "object" ? raw : {};
    const sites = {};
    if (value.sites && typeof value.sites === "object" && !Array.isArray(value.sites)) {
      for (const [host, rule] of Object.entries(value.sites)) {
        if (!host || host.length > 253 || /[\s/\\]/.test(host) ||
            ["__proto__", "constructor", "prototype"].includes(host) || !rule || typeof rule !== "object") continue;
        const normalized = {};
        if (SITE_MODES.includes(rule.mode) && rule.mode !== "inherit") normalized.mode = rule.mode;
        if (rule.force === true) normalized.force = true;
        if (Object.keys(normalized).length) sites[host.toLowerCase()] = normalized;
      }
    }
    return {
      version: 3,
      enabled: typeof value.enabled === "boolean" ? value.enabled : true,
      mode: MODES.includes(value.mode) ? value.mode : "system",
      filterPreset: FILTER_PRESETS.includes(value.filterPreset) ? value.filterPreset : "balanced",
      protectNative: typeof value.protectNative === "boolean" ? value.protectNative : true,
      sites
    };
  }

  function decide(settings, host, systemDark, detection = {}) {
    const rule = settings.sites[host] || {};
    const mode = rule.mode && rule.mode !== "inherit" ? rule.mode : settings.mode;
    if (!settings.enabled) return { apply: false, reason: "disabled", mode };
    if (mode === "off") return { apply: false, reason: "site-off", mode };
    if (mode === "light") return { apply: false, reason: "light", mode };
    if (mode === "system" && !systemDark) return { apply: false, reason: "system-light", mode };
    if (detection.otherExtension) return { apply: false, reason: "other-extension", mode };
    if (settings.protectNative && !rule.force && detection.isDark) {
      return { apply: false, reason: "native-dark", mode };
    }
    return { apply: true, reason: "converted", mode };
  }

  function patchSettings(raw, patch) {
    const settings = normalizeSettings(raw);
    if (patch.action === "global") {
      if (typeof patch.enabled === "boolean") settings.enabled = patch.enabled;
      if (MODES.includes(patch.mode)) settings.mode = patch.mode;
      if (FILTER_PRESETS.includes(patch.filterPreset)) settings.filterPreset = patch.filterPreset;
      if (typeof patch.protectNative === "boolean") settings.protectNative = patch.protectNative;
    } else if (patch.action === "site") {
      const host = patch.host;
      // A bare, canonical hostname only. No URL/path, wildcard or prototype keys.
      if (typeof host !== "string" || !host || siteKey(`https://${host}`) !== host ||
          ["__proto__", "constructor", "prototype"].includes(host)) throw new Error("无效的网站地址");
      if (patch.reset) delete settings.sites[host];
      else {
        const rule = { ...(settings.sites[host] || {}) };
        if (SITE_MODES.includes(patch.mode)) {
          if (patch.mode === "inherit") delete rule.mode;
          else rule.mode = patch.mode;
        }
        if (typeof patch.force === "boolean") {
          if (patch.force) rule.force = true;
          else delete rule.force;
        }
        if (Object.keys(rule).length) settings.sites[host] = rule;
        else delete settings.sites[host];
      }
    } else throw new Error("不支持的设置操作");
    return normalizeSettings(settings);
  }

  function parseColor(value) {
    if (typeof value !== "string") return null;
    const match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%)?)?\s*\)$/i);
    if (!match) return null;
    return [1, 2, 3].map(i => Math.min(255, Math.max(0, Number(match[i])))).concat(
      match[4] === undefined ? 1 : Math.min(1, Number(match[4]) / (match[5] ? 100 : 1))
    );
  }

  function composite(front, back) {
    const alpha = front[3] + back[3] * (1 - front[3]);
    if (!alpha) return [0, 0, 0, 0];
    return [0, 1, 2].map(i => (front[i] * front[3] + back[i] * back[3] * (1 - front[3])) / alpha).concat(alpha);
  }

  function luminance(color) {
    const rgb = color.slice(0, 3).map(channel => {
      const c = channel / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  }

  globalThis.ShadeCore = Object.freeze({ KEY, MODES, FILTER_PRESETS, SITE_MODES, DEFAULTS, isWebURL, siteKey,
    normalizeSettings, patchSettings, decide, parseColor, composite, luminance });
})();
