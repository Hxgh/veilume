import { cp, mkdir, readFile, rm, writeFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(process.argv[2] || path.join(root, "releases"));
const { version } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const { stats } = JSON.parse(await readFile(path.join(root, "test-results/results.json"), "utf8"));
if (stats.unexpected || stats.skipped || stats.flaky || stats.expected < 52) {
  throw new Error("完整端到端测试尚未全部通过，请先运行 npm run test:e2e");
}
const installFolder = path.join(output, "veilume");
await mkdir(output, { recursive: true });
await rm(installFolder, { recursive: true, force: true });
await cp(path.join(root, "dist"), installFolder, { recursive: true });
const chromeZip = `veilume-${version}-chrome.zip`;
const sourceZip = `veilume-${version}-source.zip`;
function zip(cwd, name, entries) {
  const result = spawnSync("zip", ["-q", "-r", "-X", path.join(output, name), ...entries, "-x", "*/.DS_Store", "*/node_modules/*"], { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
// Delete our generated archives so a rebuild cannot leave stale ZIP entries.
await rm(path.join(output, chromeZip), { force: true });
await rm(path.join(output, sourceZip), { force: true });
zip(output, chromeZip, ["veilume"]);
zip(root, sourceZip, ["extension", "scripts", "tests", "docs", ".github", "README.md", "LICENSE", "CONTRIBUTING.md", "CHANGELOG.md", "THIRD_PARTY_NOTICES.md", "package.json", "package-lock.json", "playwright.config.mjs", ".gitignore"]);
await cp(path.join(root, "docs"), path.join(output, "docs"), { recursive: true });
for (const name of ["LICENSE", "CONTRIBUTING.md", "CHANGELOG.md"]) await cp(path.join(root, name), path.join(output, name));
for (const [source, destination] of [
  ["README.md", "安装与使用说明.md"], ["docs/DESIGN.md", "设计方案与开源调研.md"],
  ["docs/TESTING.md", "测试报告.md"], ["THIRD_PARTY_NOTICES.md", "开源许可说明.md"],
  ["test-results/popup-light.png", "界面预览-浅色.png"], ["test-results/popup-dark.png", "界面预览-深色.png"],
  ["test-results/popup-dim.png", "界面预览-低亮.png"],
  ["test-results/before.png", "网页改色前.png"], ["test-results/after.png", "网页改色后.png"],
  ["test-results/options.png", "设置页.png"]
]) await cp(path.join(root, source), path.join(output, destination));
for (const name of ["media-protected.png", "media-filtered.png"]) await cp(path.join(root, "test-results", name), path.join(output, name));
const guide = (await readFile(path.join(root, "README.md"), "utf8"))
  .replace("docs/DESIGN.md", "设计方案与开源调研.md")
  .replace("docs/TESTING.md", "测试报告.md")
  .replace("THIRD_PARTY_NOTICES.md)", "开源许可说明.md)");
await writeFile(path.join(output, "安装与使用说明.md"), guide);
await cp(path.join(root, "test-results/results.json"), path.join(output, "自动化测试结果.json"));
// External smoke tests are optional and never required by offline fixture CI.
try { await cp(path.join(root, "test-results/live"), path.join(output, "外网抽查"), { recursive: true }); }
catch (error) { if (error.code !== "ENOENT") throw error; }

const checksums = [];
for (const name of [chromeZip, sourceZip]) {
  const bytes = await readFile(path.join(output, name));
  checksums.push(`${createHash("sha256").update(bytes).digest("hex")}  ${name}`);
}
await writeFile(path.join(output, "SHA256SUMS.txt"), `${checksums.join("\n")}\n`);

// Verify the installable copy byte-for-byte, independently of ZIP extraction.
async function verify(directory, relative = "") {
  for (const entry of await readdir(directory)) {
    const source = path.join(directory, entry);
    const name = path.join(relative, entry);
    if ((await stat(source)).isDirectory()) await verify(source, name);
    else {
      const a = await readFile(source);
      const b = await readFile(path.join(installFolder, name));
      if (!a.equals(b)) throw new Error(`交付目录不一致：${name}`);
    }
  }
}
await verify(path.join(root, "dist"));
console.log(`已交付 ${output}\n安装包：${chromeZip}\n源码：${sourceZip}\n解压目录已与构建逐文件核对。`);
