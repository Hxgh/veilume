import { test } from "node:test";
import assert from "node:assert/strict";
await import("../../extension/core.js");
const C = globalThis.ShadeCore;
const defaults = () => C.normalizeSettings();

test("默认开启并跟随系统，原生与媒体保护开启", () => {
  assert.deepEqual(defaults(), { version: 4, enabled: true, mode: "system", filterPreset: "balanced", preserveMedia: true, protectNative: true, sites: {} });
});
test("损坏的存储安全回退", () => {
  for (const value of [null, [], "bad", 42, { mode: "invalid", enabled: "false", protectNative: null, sites: [] }]) {
    assert.deepEqual(C.normalizeSettings(value), defaults());
  }
});
test("schema 1 / 2 / 3 无损迁移，媒体保护默认开启", () => {
  for (const version of [1, 2, 3]) assert.deepEqual(C.normalizeSettings({version, enabled: false, mode: "dark", protectNative: false,
    sites: {"x.com": {mode: "off", force: true}}}), {
    version: 4, enabled: false, mode: "dark", filterPreset: "balanced", preserveMedia: true, protectNative: false, sites: {"x.com": {mode: "off", force: true}}
  });
});
test("媒体开关只接受布尔值，显式关闭持久化", () => {
  assert.equal(C.normalizeSettings({ preserveMedia: false }).preserveMedia, false);
  for (const preserveMedia of [null, "false", 0, {}, []]) {
    assert.equal(C.normalizeSettings({ preserveMedia }).preserveMedia, true);
  }
  const s = { ...defaults(), mode: "dark", filterPreset: "dim", sites: { "x.com": { mode: "off" } } };
  assert.deepEqual(C.patchSettings(s, { action: "global", preserveMedia: false }), { ...s, preserveMedia: false });
  assert.equal(C.patchSettings({ ...s, preserveMedia: false }, { action: "global", preserveMedia: "true" }).preserveMedia, false);
});
test("媒体保护不影响暂停、系统浅色和原生让位", () => {
  for (const preserveMedia of [true, false]) {
    const s = { ...defaults(), preserveMedia };
    assert.equal(C.decide({ ...s, enabled: false }, "x.com", true).reason, "disabled");
    assert.equal(C.decide(s, "x.com", false).reason, "system-light");
    assert.equal(C.decide(s, "x.com", true, { isDark: true }).reason, "native-dark");
  }
});
test("只接受两个预设，损坏的预设回退推荐", () => {
  assert.equal(C.normalizeSettings({ filterPreset: "dim" }).filterPreset, "dim");
  for (const value of [null, "unknown", "__proto__", 0, {}]) {
    assert.equal(C.normalizeSettings({ filterPreset: value }).filterPreset, "balanced");
  }
});
test("修改预设保留模式、总开关和网站例外", () => {
  const before = { ...defaults(), enabled: false, mode: "dark", sites: {"x.com": {mode: "off"}} };
  const result = C.patchSettings(before, { action: "global", filterPreset: "dim" });
  assert.deepEqual(result, { ...before, filterPreset: "dim" });
});
test("非法预设写入不会覆盖有效选择", () => {
  const s = { ...defaults(), filterPreset: "dim" };
  assert.equal(C.patchSettings(s, { action: "global", filterPreset: "invalid" }).filterPreset, "dim");
});
test("显示预设不影响系统浅色或原生深色的决策", () => {
  for (const filterPreset of C.FILTER_PRESETS) {
    const s = { ...defaults(), filterPreset };
    assert.equal(C.decide(s, "x.com", false).reason, "system-light");
    assert.equal(C.decide(s, "x.com", true, {isDark: true}).reason, "native-dark");
  }
});
test("不接受原型污染与无效站点规则", () => {
  const settings = C.normalizeSettings(JSON.parse('{"sites":{"__proto__":{"mode":"dark"},"constructor":{"force":true},"bad/path":{"mode":"dark"},"EXAMPLE.COM":{"mode":"system","force":true,"extra":5},"empty.test":{"mode":"inherit"}}}'));
  assert.deepEqual(settings.sites, { "example.com": { mode: "system", force: true } });
  assert.equal({}.mode, undefined);
});
test("只支持 HTTP(S) 普通页", () => {
  for (const url of ["https://example.com", "http://localhost:3000/a", "https://example.com/a.pdf"]) assert.equal(C.isWebURL(url), true);
  for (const url of ["chrome://settings", "file:///a.html", "data:text/html,hello", "about:blank", "https://chromewebstore.google.com/detail/foo", "https://chrome.google.com/webstore/a", "garbage"]) assert.equal(C.isWebURL(url), false);
});
test("站点按完整主机名，不合并子域，忽略端口", () => {
  assert.equal(C.siteKey("https://News.Example.com:8000/a"), "news.example.com");
  assert.equal(C.siteKey("not-url"), "");
});
test("系统浅色时不转换", () => assert.equal(C.decide(defaults(), "x.com", false).reason, "system-light"));
test("系统深色时转换浅色页", () => assert.equal(C.decide(defaults(), "x.com", true).apply, true));
test("有原生能力声明但仍是浅色，不应跳过", () => assert.equal(C.decide(defaults(), "x.com", true, { isDark: false, signals: ["media-query", "color-scheme"] }).apply, true));
test("当前已经深色时保护原生设计", () => assert.equal(C.decide(defaults(), "x.com", true, { isDark: true }).reason, "native-dark"));
test("全局暂停优先于本站强制深色", () => {
  const s = { ...defaults(), enabled: false, sites: { "x.com": { mode: "dark", force: true } } };
  assert.equal(C.decide(s, "x.com", true).reason, "disabled");
});
test("本站停用优先于全局深色", () => {
  const s = { ...defaults(), mode: "dark", sites: { "x.com": { mode: "off" } } };
  assert.equal(C.decide(s, "x.com", true).reason, "site-off");
  assert.equal(C.decide(s, "y.com", true).apply, true);
});
test("本站始终深色可覆盖系统浅色", () => {
  const s = { ...defaults(), sites: { "x.com": { mode: "dark" } } };
  assert.equal(C.decide(s, "x.com", false).apply, true);
});
test("本站系统偏好可覆盖全局深色", () => {
  const s = { ...defaults(), mode: "dark", sites: { "x.com": { mode: "system" } } };
  assert.equal(C.decide(s, "x.com", false).reason, "system-light");
});
test("全局浅色只恢复原貌", () => assert.equal(C.decide({ ...defaults(), mode: "light" }, "x.com", true, { isDark: true }).reason, "light"));
test("强制反色仅绕过原生保护，不绕过系统浅色", () => {
  const s = { ...defaults(), sites: { "x.com": { force: true } } };
  assert.equal(C.decide(s, "x.com", true, { isDark: true }).apply, true);
  assert.equal(C.decide(s, "x.com", false, { isDark: true }).apply, false);
});
test("可全局关闭原生保护", () => assert.equal(C.decide({ ...defaults(), protectNative: false }, "x.com", true, { isDark: true }).apply, true));
test("同类引擎冲突始终受到保护", () => {
  const s = { ...defaults(), sites: { "x.com": { force: true } } };
  assert.equal(C.decide(s, "x.com", true, { otherExtension: true }).reason, "other-extension");
});
test("更新全局设置保留网站例外", () => {
  const s = C.patchSettings(defaults(), { action: "site", host: "x.com", mode: "off" });
  const result = C.patchSettings(s, { action: "global", mode: "dark" });
  assert.equal(result.mode, "dark"); assert.equal(result.sites["x.com"].mode, "off");
});
test("本站两种属性合并保存", () => {
  let s = C.patchSettings(defaults(), { action: "site", host: "x.com", mode: "dark" });
  s = C.patchSettings(s, { action: "site", host: "x.com", force: true });
  assert.deepEqual(s.sites["x.com"], { mode: "dark", force: true });
  s = C.patchSettings(s, { action: "site", host: "x.com", mode: "inherit" });
  assert.deepEqual(s.sites["x.com"], { force: true });
  s = C.patchSettings(s, { action: "site", host: "x.com", force: false });
  assert.deepEqual(s.sites, {});
});
test("重置本站不影响其他站点", () => {
  let s = C.patchSettings(defaults(), { action: "site", host: "x.com", mode: "off" });
  s = C.patchSettings(s, { action: "site", host: "y.com", force: true });
  s = C.patchSettings(s, { action: "site", host: "x.com", reset: true });
  assert.deepEqual(s.sites, { "y.com": { force: true } });
});
test("拒绝非规范主机名和未知动作", () => {
  for (const host of ["__proto__", "constructor", "https://x.com", "x.com/path", "X.COM", "x.com:8080", ""]) {
    assert.throws(() => C.patchSettings(defaults(), { action: "site", host, force: true }));
  }
  assert.throws(() => C.patchSettings(defaults(), { action: "delete-everything" }));
});
test("RGB 与 RGBA 透明度解析", () => {
  assert.deepEqual(C.parseColor("rgb(255, 128, 0)"), [255, 128, 0, 1]);
  assert.deepEqual(C.parseColor("rgb(20 40 60 / 50%)"), [20, 40, 60, 0.5]);
  assert.equal(C.parseColor("transparent"), null);
});
test("透明背景按祖先顺序合成", () => {
  assert.deepEqual(C.composite([0, 0, 0, 0], [255, 255, 255, 1]), [255, 255, 255, 1]);
  assert.deepEqual(C.composite([0, 0, 0, 0.5], [255, 255, 255, 1]), [127.5, 127.5, 127.5, 1]);
});
test("相对亮度符合黑白端点", () => {
  assert.equal(C.luminance([0, 0, 0]), 0);
  assert.equal(C.luminance([255, 255, 255]), 1);
  assert.ok(C.luminance([24, 27, 32]) < 0.02);
});
