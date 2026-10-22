(() => {
  "use strict";
  const Core = globalThis.ShadeCore;
  async function read() {
    const data = await chrome.storage.local.get(Core.KEY);
    return Core.normalizeSettings(data[Core.KEY]);
  }
  async function patch(value) {
    const response = await chrome.runtime.sendMessage({ type: "SHADE_PATCH", patch: value });
    if (!response?.ok) throw new Error(response?.error || "设置未能保存，请重试。");
    return Core.normalizeSettings(response.settings);
  }
  function error(value = "") {
    const element = document.getElementById("error");
    element.textContent = value;
    element.hidden = !value;
  }
  const reasons = {
    loading: ["正在识别网页", "检查网页当前的明暗外观。"],
    converted: ["整页深色已开启", "文字、背景与图片使用同一套变换。"],
    "native-dark": ["页面已经是深色", "保留原有设计，避免再次反色。"],
    "system-light": ["系统现在是浅色", "晦明不改色，网页保持原来的设计。"],
    light: ["保持网页原貌", "浅色选项会撤销插件改色，不强制改变网站原生主题。"],
    "site-off": ["本站保持原貌", "此网站不参与整页变换。"],
    disabled: ["晦明已暂停", "所有网站暂时恢复原貌，偏好仍会保留。"],
    "other-extension": ["检测到其他深色引擎", "为避免重复改色，请先关闭同类扩展后重新检测。"],
    restricted: ["此页面无法改色", "Chrome 内部页、扩展商店和内置 PDF 阅读器不开放改色权限。"],
    "unsupported-document": ["此文档不支持变换", "仅支持普通 HTML 网页；独立图片或 SVG 文档保持原貌。"],
    unavailable: ["暂时无法连接网页", "页面可能仍在加载、尚未授权或属于 PDF。请刷新后重试。"],
    error: ["改色暂未生效", "请重新检测，或刷新网页后再试。"]
  };
  const signalNames = { "media-query": "深色媒体查询", "color-scheme": "color-scheme 声明", "theme-attribute": "主题属性" };
  globalThis.ShadeUI = Object.freeze({ read, patch, error, reasons, signalNames });
})();
