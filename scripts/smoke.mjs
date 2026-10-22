import { chromium } from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { readPNG, mean } from "../tests/pixels.mjs";

// Public-page smoke tests use an isolated Chrome profile, never account forms.
const filterPreset = process.env.VEILUME_PRESET || "balanced";
if (!["balanced", "dim"].includes(filterPreset)) throw new Error("VEILUME_PRESET must be balanced or dim");
const output = path.resolve("test-results/live", filterPreset);
await mkdir(output, { recursive: true });
const profile = await mkdtemp(path.resolve("test-results/smoke-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: process.env.SHADE_BROWSER || "chrome", headless: true, colorScheme: "dark",
  viewport: { width: 1440, height: 1000 }, ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging"]
});
const results = [];
try {
  const cdp = await context.browser().newBrowserCDPSession();
  const extensionPath = process.env.SHADE_EXTENSION_PATH || path.resolve("dist");
  await cdp.send("Extensions.loadUnpacked", { path: extensionPath });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const setEnabled = enabled => worker.evaluate(async ({ enabled, filterPreset }) => {
    await chrome.storage.local.set({ systemShadeSettings: { version: 3, enabled, filterPreset, mode: "system", protectNative: true, sites: {} } });
  }, { enabled, filterPreset });
  async function getStatus(page) {
    return worker.evaluate(async url => {
      const tab = (await chrome.tabs.query({})).find(tab => tab.url === url);
      if (!tab) return null;
      try { return await chrome.tabs.sendMessage(tab.id, { type: "SHADE_STATUS" }, { frameId: 0 }); } catch { return null; }
    }, page.url());
  }
  function brightness(png) {
    const image = readPNG(png);
    let bright = 0, total = 0, sum = 0;
    for (let y = 10; y < image.height; y += 20) for (let x = 10; x < image.width; x += 20) {
      const value = mean(image.pixel(x, y)); bright += value > 200; sum += value; total++;
    }
    return { brightAreaPercent: Math.round(bright / total * 100), meanRGB: Math.round(sum / total) };
  }
  const urls = process.env.SHADE_SMOKE_URLS ? JSON.parse(process.env.SHADE_SMOKE_URLS) : [
    "https://example.com/", "https://map.baidu.com/",
    "https://www.iana.org/domains/reserved", "https://info.cern.ch/hypertext/WWW/TheProject.html",
    "https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme"
  ];
  console.log(`Chrome ${context.browser().version()}, extension ${extensionPath}`);
  for (const url of urls) {
    const page = await context.newPage();
    const result = { url, testedAt: new Date().toISOString() };
    try {
      await setEnabled(false);
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      result.httpStatus = response?.status();
      await page.waitForFunction(() => document.body && document.body.innerText.length > 10, null, { timeout: 5000 });
      // Let client-rendered apps and their public background images settle.
      await page.waitForTimeout(1500);
      const name = new URL(url).hostname;
      const before = await page.screenshot({ path: path.join(output, `${name}-before.png`) });
      result.before = brightness(before);
      await setEnabled(true);
      for (let attempt = 0; attempt < 20; attempt++) {
        result.state = await getStatus(page);
        if (result.state && !["loading", "disabled"].includes(result.state.reason)) break;
        await page.waitForTimeout(100);
      }
      await page.waitForTimeout(700);
      result.state = await getStatus(page);
      result.rootFilter = await page.locator("html").evaluate(el => getComputedStyle(el).filter);
      result.title = await page.title();
      const after = await page.screenshot({ path: path.join(output, `${name}-after.png`) });
      result.after = brightness(after);
      // Non-account interaction: scroll ordinary document, then restore top.
      if (!url.includes("map.baidu.com")) {
        await page.evaluate(() => scrollTo(0, Math.min(600, document.body.scrollHeight)));
        await page.screenshot({ path: path.join(output, `${name}-scroll.png`) });
        await page.evaluate(() => scrollTo(0, 0));
      }
      await setEnabled(false);
      result.reverted = (await getStatus(page))?.reason;
      if (result.reverted !== "disabled") {
        await page.waitForTimeout(150); result.reverted = (await getStatus(page))?.reason;
      }
    } catch (error) { result.error = error.message; }
    results.push(result); console.log(JSON.stringify(result));
    await page.close();
  }
} finally {
  await context.close(); await rm(profile, { recursive: true, force: true });
  await writeFile(path.join(output, "results.json"), JSON.stringify(results, null, 2));
}
if (results.some(result => result.error || !["converted", "native-dark"].includes(result.state?.reason) || result.reverted !== "disabled")) {
  process.exitCode = 1;
}
