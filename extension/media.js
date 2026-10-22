/* Conservative content-media classification. No image readback or network. */
(() => {
  "use strict";
  const SELECTOR = "img, video, canvas";
  const SWITCH = "data-system-shade-media";
  const MARK = "data-veilume-media";
  const DECORATIVE = /(?:^|[\s/_.-])(?:logo|icon|brand|decoration|decorative|background)(?:$|[\s/_.-])|装饰|背景|徽标|标志|品牌|图标/i;

  function isContent(element) {
    const { width, height } = element.getBoundingClientRect();
    if (width < 64 || height < 48 || element.closest('nav, button, [role="button"], [role="presentation"], [role="none"], [aria-hidden="true"]')) return false;
    // Never replace a site's own filter, or compensate nested fallback content.
    if (element.parentElement?.closest("video, canvas")) return false;
    const style = getComputedStyle(element);
    if (style.filter !== "none" || style.mixBlendMode !== "normal") return false;
    if (element.localName !== "img") return true;
    if (!element.complete || !element.naturalWidth || element.getAttribute("alt") === "") return false;
    const description = [element.id, element.getAttribute("class"), element.getAttribute("alt"),
      element.getAttribute("aria-label"), (element.currentSrc || element.src).split(/[?#]/)[0]].join(" ");
    return !DECORATIVE.test(description);
  }

  function create(root) {
    let enabled = false;
    let frame = 0;
    const tracked = new Set();
    const pending = new Set();
    const resize = new ResizeObserver(entries => {
      entries.forEach(({ target }) => pending.add(target));
      schedule();
    });

    function collect(node) {
      if (node.nodeType !== 1) return;
      if (node.matches(SELECTOR)) pending.add(node);
      node.querySelectorAll(SELECTOR).forEach(element => pending.add(element));
    }
    function flush() {
      frame = 0;
      if (!enabled) return;
      // Inspect author filters, not our own compensation; restore in this task.
      const active = root.getAttribute("data-system-shade");
      root.removeAttribute("data-system-shade");
      root.removeAttribute(SWITCH);
      try {
        for (const element of tracked) {
          if (element.isConnected) continue;
          element.removeAttribute(MARK);
          resize.unobserve(element);
          tracked.delete(element);
        }
        const results = [];
        for (const element of pending) {
          if (!element.isConnected) continue;
          if (!tracked.has(element)) { tracked.add(element); resize.observe(element); }
          results.push([element, isContent(element)]);
        }
        // Read geometry first, then write markers: no per-element layout loop.
        results.forEach(([element, preserve]) => element.toggleAttribute(MARK, preserve));
        pending.clear();
      } finally {
        if (active !== null) root.setAttribute("data-system-shade", active);
        if (enabled) root.setAttribute(SWITCH, "on");
      }
    }
    function schedule() {
      if (enabled && !frame) frame = requestAnimationFrame(flush);
    }
    const observer = new MutationObserver(records => {
      let removedMedia = false;
      for (const record of records) {
        if (record.type === "attributes") collect(record.target);
        else {
          record.addedNodes.forEach(collect);
          removedMedia ||= [...record.removedNodes].some(node => node.nodeType === 1 &&
            (node.matches(SELECTOR) || node.querySelector(SELECTOR)));
        }
      }
      // Also prune removed candidates, without keeping detached DOM alive.
      if (pending.size || removedMedia) schedule();
    });
    function onLoad(event) {
      if (event.target.matches?.(SELECTOR)) { pending.add(event.target); schedule(); }
    }
    function setEnabled(value) {
      if (value) root.setAttribute(SWITCH, "on");
      else root.removeAttribute(SWITCH);
      if (enabled === value) {
        if (value) { collect(root); schedule(); }
        return;
      }
      enabled = value;
      if (enabled) {
        collect(root);
        flush();
        observer.observe(root, { subtree: true, childList: true, attributes: true,
          attributeFilter: ["src", "srcset", "sizes", "alt", "role", "aria-label", "aria-hidden", "class", "id", "style", "width", "height", "hidden"] });
        document.addEventListener("load", onLoad, true);
        document.addEventListener("loadedmetadata", onLoad, true);
      } else {
        observer.disconnect();
        resize.disconnect();
        document.removeEventListener("load", onLoad, true);
        document.removeEventListener("loadedmetadata", onLoad, true);
        cancelAnimationFrame(frame);
        frame = 0;
        tracked.forEach(element => element.removeAttribute(MARK));
        tracked.clear();
        pending.clear();
      }
    }
    return Object.freeze({ setEnabled });
  }
  globalThis.ShadeMedia = Object.freeze({ create });
})();
