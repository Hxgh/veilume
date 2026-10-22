import { test, expect, chromium } from "@playwright/test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { readPNG, mean } from "../pixels.mjs";

const root = process.cwd();
const key = "systemShadeSettings";
const base = "http://127.0.0.1:4173";
let context, worker, id, profile, page;
const pageErrors = [];

async function reset(overrides = {}) {
  await worker.evaluate(async ({ key, overrides }) => {
    await chrome.storage.local.set({ [key]: { version: 4, enabled: true, mode: "system", filterPreset: "balanced", preserveMedia: true, protectNative: true, sites: {}, ...overrides } });
  }, { key, overrides });
}
async function status(url = page.url()) {
  return worker.evaluate(async url => {
    const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
    if (!tab) return null;
    try { return await chrome.tabs.sendMessage(tab.id, { type: "SHADE_STATUS" }, { frameId: 0 }); } catch { return null; }
  }, url);
}
async function reason(value) {
  await expect.poll(async () => (await status())?.reason, { timeout: 10000 }).toBe(value);
}
async function patch(value) {
  const ui = await context.newPage();
  await ui.goto(`chrome-extension://${id}/options.html`);
  const response = await ui.evaluate(async patch => chrome.runtime.sendMessage({ type: "SHADE_PATCH", patch }), value);
  expect(response.ok, JSON.stringify(response)).toBe(true);
  await ui.close();
  return response;
}
async function popup() {
  await page.bringToFront();
  const promise = context.waitForEvent("page");
  await worker.evaluate(async url => chrome.tabs.create({ url, active: false }), `chrome-extension://${id}/popup.html`);
  const ui = await promise;
  await ui.waitForLoadState("domcontentloaded");
  return ui;
}
async function sample(selector, x = .8, y = .75) {
  const png = readPNG(await page.locator(selector).screenshot({ animations: "disabled" }));
  return png.pixel(Math.min(png.width - 1, png.width * x), Math.min(png.height - 1, png.height * y));
}
async function isFiltered(expected = true) {
  if (expected) await expect(page.locator("html")).toHaveAttribute("data-system-shade", "on");
  else await expect(page.locator("html")).not.toHaveAttribute("data-system-shade", "on");
}

test.beforeAll(async () => {
  await mkdir(path.join(root, "test-results"), { recursive: true });
  profile = await mkdtemp(path.join(root, "test-results/profile-"));
  context = await chromium.launchPersistentContext(profile, {
    channel: process.env.SHADE_BROWSER || "chrome", headless: true, colorScheme: "dark",
    viewport: { width: 1100, height: 900 }, ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"]
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const loaded = await cdp.send("Extensions.loadUnpacked", { path: path.join(root, "dist") });
  worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  id = loaded.id;
});
test.afterAll(async () => { await context?.close(); if (profile) await rm(profile, { recursive: true, force: true }); });
test.beforeEach(async () => {
  await reset();
  page = await context.newPage();
  page.on("pageerror", error => pageErrors.push(error.message));
});
test.afterEach(async () => { await page.close(); expect(pageErrors.splice(0)).toEqual([]); });

test("白底黑字使用一个滤镜：白变近黑、黑变近白，CSS 原色不改写", async () => {
  await page.goto(`${base}/lab`); await reason("converted"); await isFiltered();
  const white = await sample("#white"), black = await sample("#black");
  for (const channel of white) expect(channel).toBeGreaterThanOrEqual(13);
  expect(mean(white)).toBeLessThan(18);
  expect(mean(black)).toBeGreaterThan(225);
  expect(mean(black)).toBeLessThan(232);
  expect(await page.locator("#white").evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
  await expect(page.locator("style.darkreader, [data-darkreader-inline-bgcolor]")).toHaveCount(0);
  await page.locator("#lab-input").fill("统一反色仍可正常输入");
  await expect(page.locator("#lab-input")).toHaveValue("统一反色仍可正常输入");
});

test("系统浅色→深色→浅色即时跟随，撤销后截图像素还原", async () => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`${base}/lab`); await reason("system-light");
  const before = await sample("#white"); expect(mean(before)).toBe(255);
  await page.emulateMedia({ colorScheme: "dark" }); await reason("converted");
  expect(mean(await sample("#white"))).toBeLessThan(20);
  await page.emulateMedia({ colorScheme: "light" }); await reason("system-light");
  expect(await sample("#white")).toEqual(before); await isFiltered(false);
});

test("已经是原生深色的页面不反成浅色", async () => {
  await page.goto(`${base}/native`); await reason("native-dark"); await isFiltered(false);
  expect((await status()).detection.signals).toContain("media-query");
  await page.emulateMedia({ colorScheme: "light" }); await reason("system-light");
});

test("现代 OKLCH 与 Display-P3 深色背景识别", async () => {
  for (const route of ["modern-native", "modern-p3"]) {
    await page.goto(`${base}/${route}`); await reason("native-dark"); await isFiltered(false);
  }
});

test("只有声明没有深色设计，仍统一反色", async () => {
  await page.goto(`${base}/declared-only`); await reason("converted"); await isFiltered();
  expect((await status()).detection.signals).toContain("color-scheme");
});

test("深色根背景不能掩盖大块白色主体", async () => {
  await page.goto(`${base}/dark-root-light-content`); await reason("converted");
});

test("原生手动主题切换时自动让位，不循环识别自己的输出", async () => {
  await page.goto(`${base}/manual-dark`); await reason("native-dark");
  await page.locator("#native-toggle").click(); await reason("converted");
  const ui = await popup();
  for (let i = 0; i < 5; i++) {
    await ui.locator("#recheck").click(); await reason("converted");
  }
  await ui.close();
  await page.locator("#native-toggle").click(); await reason("native-dark");
});

test("延迟挂载的原生主题属性能撤销反色", async () => {
  await page.goto(`${base}/late-native`); await reason("converted"); await reason("native-dark");
});

test("异步原生深色 CSS 能撤销反色", async () => {
  await page.goto(`${base}/style-late`); await reason("converted"); await reason("native-dark");
});

test("关闭媒体保护：图片、背景图、Canvas、视频海报、SVG 都参与同一次变换", async () => {
  await reset({ enabled: false, preserveMedia: false }); await page.goto(`${base}/lab`); await reason("disabled");
  const selectors = ["#lab-image", "#lab-background", "#lab-canvas", "#lab-video", "#lab-svg"];
  const before = await Promise.all(selectors.map(selector => sample(selector)));
  expect(before.every(rgb => mean(rgb) > 200)).toBe(true);
  await patch({ action: "global", enabled: true }); await reason("converted");
  const after = await Promise.all(selectors.map(selector => sample(selector)));
  expect(after.every(rgb => mean(rgb) < 70), JSON.stringify(after)).toBe(true);
  // No reverse filters or per-element edits, including background images.
  for (const selector of selectors) expect(await page.locator(selector).evaluate(el => getComputedStyle(el).filter)).toBe("none");
});

test("默认保护 picture 图片、视频海报与 Canvas，保留明暗方向与中间色", async () => {
  await page.goto(`${base}/media`); await reason("converted");
  expect((await status()).preserveMedia).toBe(true);
  for (const selector of ["#content-photo", "#content-video", "#content-canvas"]) {
    await expect(page.locator(selector)).toHaveAttribute("data-veilume-media", "");
    const color = await sample(selector, .25, .25);
    // Compensation retains polarity, but tone compression still comes from root.
    const expected = [96, 128, 160].map(c => c * .836 + .95 * .06 * 255);
    color.forEach((c, i) => expect(Math.abs(c - expected[i]), `${selector}: ${color}`).toBeLessThan(4));
    expect(mean(await sample(selector, .8, .75))).toBeGreaterThan(225);
    expect(mean(await sample(selector, .25, .75))).toBeLessThan(20);
  }
  await page.screenshot({ path: "test-results/media-protected.png" });
  await patch({ action: "global", preserveMedia: false });
  await expect(page.locator("[data-veilume-media]")).toHaveCount(0);
  expect(mean(await sample("#content-photo", .8, .75))).toBeLessThan(20);
  await page.screenshot({ path: "test-results/media-filtered.png" });
});

test("装饰图、logo、小图标、空 alt、背景和内联 SVG 不豁免，不覆盖网站滤镜", async () => {
  await page.goto(`${base}/media`); await reason("converted");
  await expect(page.locator("#content-photo")).toHaveAttribute("data-veilume-media", "");
  for (const selector of ["#decorative", "#brand-logo", "#small", "#empty-alt", "#presentational", "#background", "#inline-svg", "#authored"]) {
    expect(await page.locator(selector).getAttribute("data-veilume-media"), selector).toBeNull();
    expect(mean(await sample(selector, .8, .75)), selector).toBeLessThan(25);
  }
  expect(await page.locator("#authored").evaluate(el => getComputedStyle(el).filter)).toBe("grayscale(1)");
});

test("媒体开关可从弹窗和设置页控制，跨标签同步并在刷新后保留", async () => {
  await page.goto(`${base}/media`); await reason("converted");
  const other = await context.newPage(); await other.goto("http://localhost:4173/media");
  const ui = await popup();
  await expect(ui.locator("#preserve-media")).toBeChecked();
  await ui.locator("#preserve-media").uncheck();
  await expect.poll(async () => (await status())?.preserveMedia).toBe(false);
  await expect(other.locator("[data-veilume-media]")).toHaveCount(0);
  await page.reload(); await reason("converted");
  expect((await status()).preserveMedia).toBe(false);
  await expect(page.locator("[data-veilume-media]")).toHaveCount(0);
  await ui.goto(`chrome-extension://${id}/options.html`);
  await expect(ui.locator("#preserve-media")).not.toBeChecked();
  await ui.locator("#preserve-media").check();
  await expect(page.locator("#content-photo")).toHaveAttribute("data-veilume-media", "");
  await expect(other.locator("#content-photo")).toHaveAttribute("data-veilume-media", "");
  await expect(ui.locator("#global-mode")).toHaveValue("system");
  await ui.close(); await other.close();
});

test("动态与懒加载媒体、语义和尺寸变化重新分类，删除后清理标记", async () => {
  await page.goto(`${base}/media`); await reason("converted");
  await page.locator("#add-media").click();
  const image = page.locator("#dynamic-media");
  await expect(image).toHaveAttribute("data-veilume-media", "");
  await image.evaluate(el => { el.alt = "公司 logo"; });
  await expect(image).not.toHaveAttribute("data-veilume-media", "");
  await image.evaluate(el => { el.alt = "照片"; el.style.width = "24px"; });
  await expect(image).not.toHaveAttribute("data-veilume-media", "");
  await image.evaluate(el => { el.style.width = "160px"; el.src = "/media.svg?lazy=1"; });
  await expect(image).toHaveAttribute("data-veilume-media", "");
  await image.evaluate(el => { window.removedMedia = el; el.remove(); });
  await expect.poll(() => page.evaluate(() => window.removedMedia.hasAttribute("data-veilume-media"))).toBe(false);
  await page.evaluate(() => {
    const img = document.createElement("img"); img.id = "lazy-media"; img.alt = "等待载入的照片";
    document.querySelector("main").append(img);
  });
  await expect(page.locator("#lazy-media")).not.toHaveAttribute("data-veilume-media", "");
  await page.locator("#lazy-media").evaluate(el => { el.src = "/media.svg"; });
  await expect(page.locator("#lazy-media")).toHaveAttribute("data-veilume-media", "");
});

test("网站后加自己的媒体滤镜时让位，移除后重新保护", async () => {
  await page.goto(`${base}/media`); await reason("converted");
  const image = page.locator("#content-photo");
  await expect(image).toHaveAttribute("data-veilume-media", "");
  await image.evaluate(el => { el.style.filter = "grayscale(1)"; });
  await expect(image).not.toHaveAttribute("data-veilume-media", "");
  expect(await image.evaluate(el => getComputedStyle(el).filter)).toBe("grayscale(1)");
  await image.evaluate(el => { el.style.removeProperty("filter"); });
  await expect(image).toHaveAttribute("data-veilume-media", "");
});

test("网站动态样式表的媒体滤镜在主题重检时让位", async () => {
  await page.goto(`${base}/plain`); await reason("converted");
  const image = page.locator("#photo");
  await expect(image).toHaveAttribute("data-veilume-media", "");
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = "#photo { filter: grayscale(1); }";
    document.head.append(style);
  });
  await expect(image).not.toHaveAttribute("data-veilume-media", "");
  expect(await image.evaluate(el => getComputedStyle(el).filter)).toBe("grayscale(1)");
});

test("真实视频解码帧保留明暗方向，非仅海报，测试后暂停卸载", async () => {
  await page.goto(`${base}/media`); await reason("converted");
  expect(mean(await sample("#content-canvas"))).toBeGreaterThan(225);
  await page.evaluate(async () => {
    const video = document.getElementById("content-video");
    video.src = "/media.webm";
    video.muted = true;
    video.loop = true;
    await video.play();
  });
  await expect(page.locator("#content-video")).toHaveAttribute("data-veilume-media", "");
  expect(mean(await sample("#content-video", .8, .75))).toBeGreaterThan(225);
  expect(mean(await sample("#content-video", .25, .75))).toBeLessThan(20);
  await patch({ action: "global", preserveMedia: false });
  await expect(page.locator("[data-veilume-media]")).toHaveCount(0);
  expect(mean(await sample("#content-video", .8, .75))).toBeLessThan(20);
  await page.evaluate(() => {
    const video = document.getElementById("content-video");
    video.pause(); video.removeAttribute("src"); video.load();
  });
});

test("不豁免 iframe 或 Shadow DOM 宿主，封闭与开放根内媒体仍随整页变换", async () => {
  await page.goto(`${base}/media`); await reason("converted");
  await page.evaluate(() => {
    for (const mode of ["open", "closed"]) {
      const host = document.createElement("div"); host.id = `media-${mode}`;
      const shadow = host.attachShadow({ mode });
      const image = document.createElement("img"); image.src = "/media.svg"; image.alt = "Shadow 内容照片";
      image.width = 160; image.height = 100; shadow.append(image);
      document.body.append(host);
    }
    const frame = document.createElement("iframe"); frame.id = "media-frame"; frame.src = "/media";
    document.body.append(frame);
  });
  await expect(page.locator("#media-open img")).toBeVisible();
  expect(mean(await sample("#media-open img"))).toBeLessThan(20);
  expect(await page.locator("#media-open img").getAttribute("data-veilume-media")).toBeNull();
  expect(await page.locator("#media-closed").getAttribute("data-veilume-media")).toBeNull();
  const frame = page.frameLocator("#media-frame");
  await expect(frame.locator("#content-photo")).toBeVisible();
  expect(await frame.locator("#content-photo").getAttribute("data-veilume-media")).toBeNull();
});

test("媒体保护跟随均衡与低亮的统一亮度，不改变预设决策", async () => {
  await page.goto(`${base}/media`); await reason("converted");
  expect(mean(await sample("#content-photo"))).toBeGreaterThan(225);
  await patch({ action: "global", filterPreset: "dim" });
  await expect.poll(async () => (await status())?.filterPreset).toBe("dim");
  const white = mean(await sample("#content-photo"));
  expect(white).toBeGreaterThan(192); expect(white).toBeLessThan(200);
  expect(mean(await sample("#decorative"))).toBeLessThan(16);
});

test("对话框、Popover 和容器全屏内媒体只补偿一次", async () => {
  await page.goto(`${base}/media`); await reason("converted");
  await page.locator("#dialog-open").click();
  await expect(page.locator("#dialog-photo")).toHaveAttribute("data-veilume-media", "");
  expect(mean(await sample("#dialog-photo"))).toBeGreaterThan(225);
  expect(mean(await sample("#dialog", .99, .5))).toBeLessThan(20);
  await page.locator("#dialog-close").click();
  await page.locator("#popover-open").click();
  await expect(page.locator("#popover-photo")).toHaveAttribute("data-veilume-media", "");
  expect(mean(await sample("#popover-photo"))).toBeGreaterThan(225);
  await page.keyboard.press("Escape");
  await page.locator("#screen-open").click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe("screen");
  expect(mean(await sample("#screen-photo"))).toBeGreaterThan(225);
  expect(mean(await sample("#screen", .9, .8))).toBeLessThan(20);
  await page.evaluate(() => document.exitFullscreen());
});

test("视频本身全屏时不反色，退出继续保护，关闭开关则恢复统一算法", async () => {
  await page.goto(`${base}/media`); await reason("converted");
  await page.locator("#video-open").click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe("content-video");
  expect(await page.locator("#content-video").evaluate(el => getComputedStyle(el).filter)).toBe("none");
  expect(mean(await sample("#content-video", .8, .5))).toBe(255);
  await patch({ action: "global", preserveMedia: false });
  await expect.poll(() => page.locator("#content-video").evaluate(el => getComputedStyle(el).filter)).toContain("invert(1)");
  expect(mean(await sample("#content-video", .8, .5))).toBeLessThan(20);
  await page.evaluate(() => document.exitFullscreen());
  await patch({ action: "global", preserveMedia: true });
  await expect(page.locator("#content-video")).toHaveAttribute("data-veilume-media", "");
  expect(mean(await sample("#content-video"))).toBeGreaterThan(225);
});

test("打印、系统浅色、暂停与原生深色时不残留媒体补偿", async () => {
  await page.goto(`${base}/media`); await reason("converted");
  await page.emulateMedia({ media: "print" });
  expect(await page.locator("#content-photo").evaluate(el => getComputedStyle(el).filter)).toBe("none");
  expect(mean(await sample("#content-photo"))).toBe(255);
  await page.emulateMedia({ media: "screen", colorScheme: "light" }); await reason("system-light");
  await expect(page.locator("[data-veilume-media]")).toHaveCount(0);
  expect(await page.locator("html").getAttribute("data-system-shade-media")).toBeNull();
  await page.emulateMedia({ colorScheme: "dark" }); await reason("converted");
  await expect(page.locator("#content-photo")).toHaveAttribute("data-veilume-media", "");
  await patch({ action: "global", enabled: false }); await reason("disabled");
  await expect(page.locator("[data-veilume-media]")).toHaveCount(0);
  expect(mean(await sample("#content-photo"))).toBe(255);
  await patch({ action: "global", enabled: true });
  await page.goto(`${base}/native`); await reason("native-dark");
  await expect(page.locator("[data-veilume-media]")).toHaveCount(0);
});

test("大亮背景、黑色 logo、公告条一起转换，复现截图问题的回归", async () => {
  await reset({ enabled: false }); await page.goto(`${base}/split-login`); await reason("disabled");
  await page.screenshot({ path: "test-results/before.png" });
  expect(mean(await sample("#large-hero", .15, .15))).toBeGreaterThan(220);
  await patch({ action: "global", enabled: true }); await reason("converted");
  expect(mean(await sample("#large-hero", .15, .15))).toBeLessThan(50);
  expect(mean(await sample(".announcement", .05, .5))).toBeLessThan(50);
  expect(mean(await sample(".login-panel", .05, .95))).toBeLessThan(30);
  const logo = readPNG(await page.locator("#brand-logo").screenshot());
  expect(mean(logo.pixel(16, 16))).toBeGreaterThan(200);
  await page.screenshot({ path: "test-results/after.png" });
});

test("亮色地图画布背后的黑色 CSS 不能冒充原生深色", async () => {
  await page.goto(`${base}/canvas-fallback`); await reason("converted");
  expect((await status()).detection.unknownSamples).toBe(20);
  expect(mean(await sample("#full-canvas"))).toBeGreaterThan(220);
});

test("同源、跨域和 srcdoc iframe 只反色一次，子框架无控制器", async () => {
  await page.goto(`${base}/lab`); await reason("converted");
  for (const selector of ["#lab-same", "#lab-cross", "#lab-srcdoc"]) {
    expect(mean(await sample(selector))).toBeLessThan(20);
    const frame = await page.locator(selector).elementHandle().then(el => el.contentFrame());
    expect(await frame.locator("html").getAttribute("data-system-shade")).toBeNull();
    expect(await frame.locator("html").evaluate(el => getComputedStyle(el).filter)).toBe("none");
  }
  await patch({ action: "site", host: "127.0.0.1", mode: "off" }); await reason("site-off");
  expect(mean(await sample("#lab-cross"))).toBe(255);
});

test("原本透明的浏览器画布也变暗，撤销后透明样式复原", async () => {
  await page.goto(`${base}/transparent`); await reason("converted");
  const png = readPNG(await page.screenshot());
  expect(mean(png.pixel(1000, 800))).toBeLessThan(20);
  await expect(page.locator("html")).toHaveAttribute("data-system-shade-canvas", "");
  await patch({ action: "global", enabled: false }); await reason("disabled");
  expect(await page.locator("html").evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
});

test("原生暗色默认画布受保护，强制反色时使用正确的 Canvas 输入", async () => {
  await page.goto(`${base}/transparent`); await reason("converted");
  await page.evaluate(() => { document.documentElement.style.colorScheme = "dark"; });
  await reason("native-dark");
  await patch({ action: "site", host: "127.0.0.1", force: true }); await reason("converted");
  expect(mean(readPNG(await page.screenshot()).pixel(1000, 800))).toBeGreaterThan(200);
  await patch({ action: "site", host: "127.0.0.1", force: false }); await reason("native-dark");
});

test("动态 DOM 和 CSSOM 的颜色不需分析即可自动参与变换", async () => {
  await page.goto(`${base}/dynamic`); await reason("converted");
  await page.locator("#add-content").click(); expect(mean(await sample(".dynamic-card", .9, .8))).toBeLessThan(20);
  await page.locator("#cssom").click(); expect(mean(await sample("#cssom-target", .9, .8))).toBeLessThan(20);
  await page.locator("#add-shadow").click(); expect(mean(await sample("shade-sample .surface", .9, .8))).toBeLessThan(20);
});

test("封闭 Shadow DOM 无需侵入即可统一反色", async () => {
  await page.goto(`${base}/lab`); await reason("converted");
  expect(mean(await sample("#closed-shadow", .05, .8))).toBeLessThan(20);
  expect(await page.locator("#closed-shadow").evaluate(el => el.shadowRoot)).toBeNull();
});

test("固定元素滚动后位置不变，没有包裹或移动网页 DOM", async () => {
  await reset({ enabled: false }); await page.goto(`${base}/lab`); await reason("disabled");
  const before = await page.locator("#fixed").boundingBox();
  await patch({ action: "global", enabled: true }); await reason("converted");
  await page.evaluate(() => scrollTo(0, 500));
  const after = await page.locator("#fixed").boundingBox();
  expect(after).toEqual(before);
  expect(await page.locator("main").evaluate(el => el.parentNode.tagName)).toBe("BODY");
});

test("顶层原生对话框使用同一变换，不漏白也不双重反色", async () => {
  await page.goto(`${base}/lab`); await reason("converted");
  await page.locator("#dialog-open").click();
  expect(mean(await sample("#lab-dialog", .9, .85))).toBeLessThan(20);
  await page.locator("#dialog-close").click();
});

test("顶层 Popover 使用同一变换", async () => {
  await page.goto(`${base}/lab`); await reason("converted");
  await page.locator("#popover-open").click();
  expect(mean(await sample("#lab-popover", .9, .85))).toBeLessThan(20);
});

test("全屏元素使用同一变换，退出后恢复单次整页反色", async () => {
  await page.goto(`${base}/lab`); await reason("converted");
  await page.locator("#fullscreen-open").click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  expect(mean(await sample("#fullscreen-box", .8, .8))).toBeLessThan(20);
  await page.evaluate(() => document.exitFullscreen());
  expect(mean(await sample("#white"))).toBeLessThan(20);
});

test("CSS 渐变和 CSS 背景图统一变暗，计算样式保持原样", async () => {
  await page.goto(`${base}/lab`); await reason("converted");
  expect(mean(await sample("#gradient-test"))).toBeLessThan(40);
  expect(await page.locator("#gradient-test").evaluate(el => getComputedStyle(el).backgroundImage)).toContain("rgb(255, 255, 255)");
});

test("跨域 CSS 无需读取，后台没有任何补取请求", async () => {
  let workerRequests = 0;
  await context.route("https://assets.systemshade.example/external.css", async route => {
    if (route.request().serviceWorker()) workerRequests++;
    await route.fulfill({ contentType: "text/css", body: "#external-target { background:#fff; color:#111; padding:24px; }" });
  });
  try {
    await page.goto(`${base}/external`); await reason("converted");
    expect(mean(await sample("#external-target", .9, .85))).toBeLessThan(20);
    expect(workerRequests).toBe(0);
    expect(await worker.evaluate(() => typeof fetchCSS)).toBe("undefined");
  } finally { await context.unroute("https://assets.systemshade.example/external.css"); }
});

test("严格 style-src/script-src 页面仍生效，无内联脚本或样式注入报错", async () => {
  const errors = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${base}/strict-style`); await reason("converted");
  expect(mean(await sample("#white"))).toBeLessThan(20);
  expect(errors.filter(text => /Content Security Policy|Refused to|Uncaught/i.test(text))).toEqual([]);
});

test("打印不反色，返回屏幕后继续深色", async () => {
  await page.goto(`${base}/lab`); await reason("converted");
  await page.emulateMedia({ media: "print" });
  expect(await page.locator("html").evaluate(el => getComputedStyle(el).filter)).toBe("none");
  expect(mean(await sample("#white"))).toBe(255);
  await page.emulateMedia({ media: "screen" });
  expect(mean(await sample("#white"))).toBeLessThan(20);
});

test("弹窗控制全局开关、外观、本站例外和重置", async () => {
  await page.goto(`${base}/plain`); await reason("converted");
  const ui = await popup();
  await expect(ui.locator("#hostname")).toHaveText("127.0.0.1");
  await expect(ui.locator("#status-title")).toHaveText("整页深色已开启");
  await ui.getByRole("switch", { name: "启用晦明" }).click(); await reason("disabled");
  await ui.getByRole("switch", { name: "启用晦明" }).click(); await reason("converted");
  await ui.locator('[data-mode="light"]').click(); await reason("light");
  await ui.locator('[data-mode="dark"]').click(); await reason("converted");
  await ui.locator('[data-mode="system"]').click(); await reason("converted");
  await ui.locator("#site-mode").selectOption("off"); await reason("site-off");
  await ui.locator("#reset-site").click(); await reason("converted");
  await expect(ui.locator("#error")).toBeHidden(); await ui.close();
});

test("原生保护可强制纠正，也能恢复", async () => {
  await page.goto(`${base}/native`); await reason("native-dark");
  const ui = await popup();
  await ui.locator("#force").check(); await reason("converted");
  await ui.locator("#force").uncheck(); await reason("native-dark");
  await ui.close();
});

test("均衡/低亮即时预览、一键恢复推荐，暂停时清理预设属性", async () => {
  await page.goto(`${base}/lab`); await reason("converted");
  const balanced = await sample("#black");
  const ui = await popup();
  await expect(ui.locator("#filter-preset")).toHaveValue("balanced");
  await ui.locator("#filter-preset").selectOption("dim");
  await expect.poll(async () => (await status())?.filterPreset).toBe("dim");
  const dim = await sample("#black");
  expect(mean(dim)).toBeGreaterThan(190); expect(mean(dim)).toBeLessThan(200);
  expect(mean(dim)).toBeLessThan(mean(balanced) - 25);
  await expect(ui.locator("#reset-preset")).toBeVisible();
  await ui.locator("#reset-preset").click();
  await expect.poll(async () => (await status())?.filterPreset).toBe("balanced");
  expect(await sample("#black")).toEqual(balanced);
  await ui.locator("#filter-preset").selectOption("dim");
  await ui.getByRole("switch", { name: "启用晦明" }).click(); await reason("disabled");
  expect(await page.locator("html").getAttribute("data-system-shade-preset")).toBeNull();
  expect(mean(await sample("#white"))).toBe(255);
  await ui.getByRole("switch", { name: "启用晦明" }).click(); await reason("converted");
  await expect(page.locator("html")).toHaveAttribute("data-system-shade-preset", "dim");
  await ui.close();
});

test("设置页预设跨标签同步、刷新持久化，且不改变跟随系统模式", async () => {
  await page.goto(`${base}/lab`); await reason("converted");
  const other = await context.newPage(); await other.goto("http://localhost:4173/lab");
  const ui = await context.newPage(); await ui.goto(`chrome-extension://${id}/options.html`);
  await ui.locator("#filter-preset").selectOption("dim");
  await expect.poll(async () => (await status())?.filterPreset).toBe("dim");
  await expect.poll(async () => (await status(other.url()))?.filterPreset).toBe("dim");
  await page.reload(); await reason("converted");
  expect((await status()).filterPreset).toBe("dim");
  await expect(ui.locator("#global-mode")).toHaveValue("system");
  await page.emulateMedia({ colorScheme: "light" }); await reason("system-light");
  await ui.locator("#filter-preset").selectOption("balanced");
  await reason("system-light"); await isFiltered(false);
  await ui.close(); await other.close();
});

test("低亮预设对 iframe、对话框、Popover 和全屏使用同一亮度", async () => {
  await reset({ filterPreset: "dim" }); await page.goto(`${base}/lab`); await reason("converted");
  const rootFilter = await page.locator("html").evaluate(el => getComputedStyle(el).filter);
  expect(rootFilter).toContain("brightness(0.82)");
  expect(mean(await sample("#lab-cross"))).toBeLessThan(15);
  await page.locator("#dialog-open").click();
  expect(await page.locator("#lab-dialog").evaluate(el => getComputedStyle(el).filter)).toBe(rootFilter);
  await page.locator("#dialog-close").click();
  await page.locator("#popover-open").click();
  expect(await page.locator("#lab-popover").evaluate(el => getComputedStyle(el).filter)).toBe(rootFilter);
  await page.keyboard.press("Escape");
  await page.locator("#fullscreen-open").click();
  expect(await page.locator("#fullscreen-box").evaluate(el => getComputedStyle(el).filter)).toBe(rootFilter);
  await page.evaluate(() => document.exitFullscreen());
});

test("本站偏好按主机隔离、跨标签同步、刷新持久化", async () => {
  await page.goto(`${base}/plain`); await reason("converted");
  const second = await context.newPage(); await second.goto(`${base}/dynamic`);
  const other = await context.newPage(); await other.goto("http://localhost:4173/plain");
  await patch({ action: "site", host: "127.0.0.1", mode: "off" }); await reason("site-off");
  await expect.poll(async () => (await status(second.url()))?.reason).toBe("site-off");
  await expect.poll(async () => (await status(other.url()))?.reason).toBe("converted");
  await page.reload(); await reason("site-off");
  await second.close(); await other.close();
});

test("设置页关闭保护、管理例外、并发写入不丢设置", async () => {
  await page.goto(`${base}/native`); await reason("native-dark");
  const ui = await context.newPage(); await ui.goto(`chrome-extension://${id}/options.html`);
  await ui.locator("#protect-native").uncheck(); await reason("converted");
  const results = await ui.evaluate(async () => Promise.all([
    chrome.runtime.sendMessage({ type: "SHADE_PATCH", patch: { action: "site", host: "a.test", mode: "off" } }),
    chrome.runtime.sendMessage({ type: "SHADE_PATCH", patch: { action: "site", host: "b.test", mode: "dark" } })
  ]));
  expect(results.every(result => result.ok)).toBe(true);
  await expect(ui.locator(".saved-site")).toHaveCount(2);
  await ui.getByRole("button", { name: "清除 a.test 的例外" }).click();
  await expect(ui.locator(".saved-site")).toHaveCount(1);
  await expect(ui.locator("#error")).toBeHidden(); await ui.close();
});

test("受限页说明原因，不伪报成功", async () => {
  await page.goto("chrome://version");
  const ui = await popup();
  await expect(ui.locator("#status-title")).toHaveText("此页面无法改色");
  await expect(ui.locator("#site-mode")).toBeDisabled(); await expect(ui.locator("#force")).toBeDisabled();
  await ui.close();
});

test("其他 Dark Reader 存在时不重复转换", async () => {
  await page.goto(`${base}/other`); await reason("other-extension"); await isFiltered(false);
});

test("网站 CSSOM 原型、内联样式、会话存储不被改写", async () => {
  await reset({ enabled: false });
  await page.addInitScript(() => {
    window.originalInsertRule = CSSStyleSheet.prototype.insertRule;
    sessionStorage.setItem("website-owned", "keep me");
  });
  await page.goto(`${base}/plain`); await reason("disabled");
  const before = await page.locator("body").getAttribute("style");
  await patch({ action: "global", enabled: true }); await reason("converted");
  expect(await page.evaluate(() => CSSStyleSheet.prototype.insertRule === window.originalInsertRule)).toBe(true);
  await patch({ action: "global", enabled: false }); await reason("disabled");
  expect(await page.locator("body").getAttribute("style")).toBe(before);
  expect(await page.evaluate(() => ({ keys: Object.keys(sessionStorage), value: sessionStorage.getItem("website-owned") })))
    .toEqual({ keys: ["website-owned"], value: "keep me" });
});

test("网站主题过渡动画结束后不会叠加反色", async () => {
  await page.goto(`${base}/native-transition`); await reason("converted");
  await page.locator("#native-toggle").click(); await reason("native-dark"); await isFiltered(false);
});

test("网站根元素阻止滤镜时显示错误，不显示虚假的已开启", async () => {
  await page.goto(`${base}/lab`); await reason("converted");
  await page.evaluate(() => document.documentElement.style.setProperty("filter", "grayscale(1)", "important"));
  await reason("error"); await isFiltered(false);
});

test("慢加载页面在 DOMContentLoaded 之前即可启用", async () => {
  await page.goto(`${base}/slow`, { waitUntil: "commit" });
  await page.locator("#note").waitFor(); await reason("converted");
  expect(await page.evaluate(() => performance.getEntriesByType("navigation")[0].domContentLoadedEventStart)).toBe(0);
});

test("安装前已打开的页面通过弹窗接入，只注入顶层", async () => {
  const freshProfile = await mkdtemp(path.join(root, "test-results/preinstall-"));
  const fresh = await chromium.launchPersistentContext(freshProfile, {
    channel: process.env.SHADE_BROWSER || "chrome", headless: true, colorScheme: "dark",
    ignoreDefaultArgs: ["--disable-extensions"], args: ["--enable-unsafe-extension-debugging"]
  });
  try {
    const old = await fresh.newPage(); await old.goto(`${base}/lab`);
    const cdp = await fresh.browser().newBrowserCDPSession();
    const loaded = await cdp.send("Extensions.loadUnpacked", { path: path.join(root, "dist") });
    const bgWorker = fresh.serviceWorkers()[0] || await fresh.waitForEvent("serviceworker");
    await old.bringToFront();
    const promise = fresh.waitForEvent("page");
    await bgWorker.evaluate(async url => chrome.tabs.create({ url, active: false }), `chrome-extension://${loaded.id}/popup.html`);
    const ui = await promise;
    await expect(ui.locator("#status-title")).toHaveText("整页深色已开启");
    await expect(old.locator("html")).toHaveAttribute("data-system-shade", "on");
  } finally { await fresh.close(); await rm(freshProfile, { recursive: true, force: true }); }
});

test("中性黑白灰界面、600px 内完整显示、无横向溢出", async () => {
  await page.goto(`${base}/plain`); await reason("converted");
  const ui = await popup(); await expect(ui.locator("#status-title")).toHaveText("整页深色已开启");
  await ui.setViewportSize({ width: 390, height: 600 });
  expect(await ui.evaluate(() => document.body.scrollHeight)).toBeLessThanOrEqual(600);
  await ui.screenshot({ path: "test-results/popup-dark.png", fullPage: true, animations: "disabled" });
  await ui.locator("#filter-preset").selectOption("dim");
  await expect(ui.locator("#reset-preset")).toBeVisible();
  expect(await ui.evaluate(() => document.body.scrollHeight)).toBeLessThanOrEqual(600);
  await ui.screenshot({ path: "test-results/popup-dim.png", fullPage: true, animations: "disabled" });
  await ui.locator("#reset-preset").click();
  const neutral = await ui.locator("body").evaluate(el => getComputedStyle(el).backgroundColor);
  expect(neutral).toBe("rgb(23, 23, 23)");
  await ui.locator('[data-mode="dark"]').click();
  await ui.emulateMedia({ colorScheme: "light" });
  await ui.screenshot({ path: "test-results/popup-light.png", fullPage: true, animations: "disabled" });
  expect(await ui.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await ui.goto(`chrome-extension://${id}/options.html`);
  await expect(ui.locator("#enabled")).toBeChecked();
  await ui.setViewportSize({ width: 1100, height: 1200 });
  await ui.screenshot({ path: "test-results/options.png", fullPage: true, animations: "disabled" });
  await ui.setViewportSize({ width: 390, height: 900 });
  expect(await ui.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  // Real, synthetic-only screenshots at the store's accepted 16:10 size.
  await ui.setViewportSize({ width: 1280, height: 800 });
  await ui.emulateMedia({ colorScheme: "dark" });
  await ui.screenshot({ path: "test-results/store-settings.png", animations: "disabled" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: "test-results/store-page.png", animations: "disabled" });
  await ui.close();
});
