(() => {
  "use strict";
  const { parseColor, composite, luminance } = globalThis.ShadeCore;
  const MEDIA = /^(IMG|PICTURE|VIDEO|CANVAS|SVG|IFRAME|OBJECT|EMBED)$/;
  const THEME_ATTRIBUTES = ["data-theme", "data-color-mode", "data-bs-theme", "data-mode", "class"];

  function capabilities() {
    const signals = new Set();
    let inaccessibleSheets = 0;
    let budget = 3000;
    const seen = new Set();
    function scan(sheet) {
      if (!sheet || seen.has(sheet) || budget <= 0 || sheet.ownerNode?.classList?.contains("darkreader")) return;
      seen.add(sheet);
      try { walk(sheet.cssRules); } catch { inaccessibleSheets++; }
    }
    function walk(rules) {
      for (const rule of rules) {
        if (--budget < 0) return;
        if (/prefers-color-scheme\s*:\s*dark/i.test(rule.conditionText || rule.media?.mediaText || "")) signals.add("media-query");
        if (rule.style?.getPropertyValue("color-scheme").includes("dark")) signals.add("color-scheme");
        if (rule.styleSheet) scan(rule.styleSheet);
        if (rule.cssRules) walk(rule.cssRules);
      }
    }
    for (const sheet of document.styleSheets) scan(sheet);
    if (document.querySelector('meta[name="color-scheme" i]')?.content.includes("dark")) signals.add("color-scheme");
    for (const element of [document.documentElement, document.body]) {
      if (!element) continue;
      if (getComputedStyle(element).colorScheme.includes("dark")) signals.add("color-scheme");
      if (THEME_ATTRIBUTES.some(name => /(?:^|[\s_-])(dark|night|dim)(?:$|[\s_-])/i.test(element.getAttribute(name) || ""))) {
        signals.add("theme-attribute");
      }
    }
    return { signals: [...signals], inaccessibleSheets, truncated: budget < 0 };
  }

  function effectiveBackground(element, canvas, readColor) {
    let color = [0, 0, 0, 0];
    let node = element;
    for (let depth = 0; node && depth < 40; depth++) {
      const style = getComputedStyle(node);
      // Invisible/partly transparent hit-test overlays do not prove that the
      // apparent pixels match their CSS background (common over maps/canvas).
      if (Number(style.opacity) < 0.99 || style.mixBlendMode !== "normal") return null;
      // A light map/image can sit on a black CSS fallback. CSS alone cannot
      // prove those pixels are dark; do not promote the fallback to evidence.
      if (color[3] < 0.99) {
        if (style.backgroundImage !== "none") return null;
        const background = readColor(style.backgroundColor);
        if (background) color = composite(color, background);
      }
      node = node.parentElement || node.getRootNode()?.host;
    }
    return composite(color, canvas);
  }

  function detect() {
    const root = document.documentElement;
    const empty = { isDark: false, otherExtension: false, signals: [], inaccessibleSheets: 0, samples: 0, darkRatio: 0 };
    if (!root || !document.body) return empty;
    if (root.hasAttribute("data-darkreader-scheme") || document.querySelector("style.darkreader")) {
      return { ...empty, otherExtension: true };
    }
    const scheme = getComputedStyle(root).colorScheme;
    const darkCanvas = scheme.includes("dark") && (!scheme.includes("light") || matchMedia("(prefers-color-scheme: dark)").matches);
    const canvas = darkCanvas ? [18, 18, 18, 1] : [255, 255, 255, 1];
    const colorCache = new Map();
    let context;
    function readColor(value) {
      const rgb = parseColor(value);
      if (rgb) return rgb;
      if (colorCache.has(value)) return colorCache.get(value);
      // getComputedStyle can preserve oklch()/color(display-p3 ...). Let the
      // browser convert a 1px, off-DOM color swatch to sRGB; no images are read.
      if (!CSS.supports("color", value)) return null;
      context ||= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const data = context.getImageData(0, 0, 1, 1).data;
      const result = [data[0], data[1], data[2], data[3] / 255];
      colorCache.set(value, result);
      return result;
    }
    const samples = [];
    let unknownSamples = 0;
    for (const x of [0.12, 0.32, 0.5, 0.68, 0.88]) {
      for (const y of [0.18, 0.4, 0.64, 0.85]) {
        let element = document.elementFromPoint(innerWidth * x, innerHeight * y);
        if (!element) continue;
        for (let depth = 0; element.shadowRoot && depth < 8; depth++) {
          const child = element.shadowRoot.elementFromPoint?.(innerWidth * x, innerHeight * y);
          if (!child || child === element) break;
          element = child;
        }
        if (MEDIA.test(element.tagName) || element.closest("svg")) { unknownSamples++; continue; }
        const background = effectiveBackground(element, canvas, readColor);
        if (background) samples.push(luminance(background));
        else unknownSamples++;
      }
    }
    const count = samples.length + unknownSamples;
    const darkRatio = count ? samples.filter(value => value < 0.16).length / count : 0;
    const brightRatio = count ? samples.filter(value => value > 0.5).length / count : 0;
    const average = samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : 1;
    return {
      ...capabilities(),
      // Signals indicate capability, never prove that the current page is dark.
      isDark: darkRatio >= 0.65 && brightRatio < 0.25 && average < 0.22,
      otherExtension: false,
      samples: count,
      unknownSamples,
      darkRatio: Math.round(darkRatio * 100),
      averageLuminance: Math.round(average * 1000) / 1000,
      transparentCanvas: [root, document.body].every(element => {
        const style = getComputedStyle(element);
        return readColor(style.backgroundColor)?.[3] === 0 && style.backgroundImage === "none";
      })
    };
  }
  globalThis.ShadeDetector = Object.freeze({ detect });
})();
