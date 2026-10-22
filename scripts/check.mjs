import { readFile, readdir, stat, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
async function files(dir) {
  const entries = await readdir(dir);
  return (await Promise.all(entries.map(async entry => {
    const file = path.join(dir, entry);
    return (await stat(file)).isDirectory() ? files(file) : file;
  }))).flat();
}
for (const file of (await files(path.join(root, "extension"))).filter(file => file.endsWith(".js"))) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status) throw new Error(result.stderr);
}
const manifest = JSON.parse(await readFile(path.join(root, "dist/manifest.json"), "utf8"));
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (manifest.version !== pkg.version) throw new Error("扩展与 package 版本不一致");
if (manifest.name !== "晦明 · Veilume") throw new Error("扩展名称不一致");
if (manifest.manifest_version !== 3) throw new Error("需要 Manifest V3");
const referenced = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page,
  ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(script => [...script.js, ...script.css])];
for (const file of referenced) await access(path.join(root, "dist", file));
for (const file of (await files(path.join(root, "dist"))).filter(file => file.endsWith(".html"))) {
  const source = await readFile(file, "utf8");
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(source)) throw new Error(`不允许内联脚本：${file}`);
  for (const [, asset] of source.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (!/^https?:/.test(asset)) await access(path.join(root, "dist", asset));
  }
}
if (manifest.content_scripts.some(script => script.world === "MAIN" || script.all_frames)) throw new Error("不能进入 MAIN world 或向 iframe 重复注入");
for (const file of (await files(path.join(root, "extension"))).filter(file => file.endsWith(".js"))) {
  const source = await readFile(file, "utf8");
  if (/\bfetch\s*\(|XMLHttpRequest|\beval\s*\(|new Function\s*\(/.test(source)) throw new Error(`运行时代码含网络或动态执行：${file}`);
}
console.log("语法、MV3、资源、CSP、无网络读取和单次顶层注入检查通过。");
