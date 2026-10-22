import http from "node:http";
import { readFile } from "node:fs/promises";

const assets = new URL("./fixtures/", import.meta.url);
function fixture(pathname) {
  const native = pathname === "/native";
  const declared = pathname === "/declared-only";
  const dark = pathname === "/manual-dark";
  const classes = [native ? "native" : "", pathname === "/dark-root-light-content" ? "dark-root" : ""].filter(Boolean).join(" ");
  let specialCSS = pathname === "/native-transition" ? "html, body { transition: background-color .7s, color .7s; }" : "";
  if (pathname === "/modern-native" || pathname === "/modern-p3") {
    const background = pathname === "/modern-native" ? "oklch(0.22 0.02 160)" : "color(display-p3 0.05 0.1 0.07)";
    specialCSS = `html, body, .card {background:${background};color:#eee} p {color:#b3c8b7}`;
  }
  return `<!doctype html><html lang="zh-CN" class="${classes}"${dark ? ' data-theme="dark"' : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>光野 · 晦明测试页 ${pathname}</title>${native || declared ? '<meta name="color-scheme" content="light dark">' : ""}<link rel="stylesheet" href="/site.css">${pathname === "/external" ? '<link rel="stylesheet" href="https://assets.systemshade.example/external.css">' : ""}<script src="/site.js" defer></script></head><body>
  ${pathname === "/slow" ? '<script src="/slow.js" defer></script>' : ""}<style>${specialCSS}</style><nav><div class="wordmark">◐ 光野 / FIELDNOTES</div><div class="nav-links"><span>阅读</span><span>设计</span><span>关于</span></div></nav>
  <main><section class="intro"><div><span class="kicker">A QUIETER WAY TO BROWSE</span><h1>留一点夜色，<br>给专注的自己。</h1><p>有些网页只有白天。让明暗跟随系统，<br>用一套变换处理整个页面。</p><a href="#read">从这里，慢慢读下去 ↗</a></div><img class="hero-image" id="photo" src="/photo.svg" alt="由绿色山峦、河流与阳光构成的插画"></section>
  <section class="cards" id="read"><article class="card"><h2>一套算法，统一明暗</h2><p>背景、文字和图像一起变换，避免局部明暗割裂。颜色不合适时，可以恢复本站原貌。</p><div class="swatches"><i class="swatch"></i><i class="swatch"></i><i class="swatch"></i></div><div class="tiny">整页一致 · 明暗有度 · 本地运行</div><div id="external-target">跨域样式测试区域</div></article><article class="card"><h2>把偏好留在这个网站</h2><p>表单与交互，不必因为夜色改变。</p><label>一条阅读笔记<input id="note" placeholder="今天想记住什么？"></label><button id="add-content">加载一段新内容</button></article></section>
  <div class="media-row"><canvas id="canvas" width="80" height="40"></canvas><video id="video" aria-label="视频海报变换测试"></video><div class="background-image" id="background-image"></div></div>
  <button id="native-toggle">切换网站自己的主题</button> <button id="add-shadow">添加 Shadow DOM</button> <button id="cssom">CSSOM 动态样式</button><div id="cssom-target"></div><div id="gradient-test" style="background:linear-gradient(white,#e8e8e8);height:40px;margin-top:12px"></div>
  ${pathname === "/frames" ? '<iframe id="same-frame" src="/plain" title="同源框架"></iframe><iframe id="cross-frame" src="http://localhost:4173/plain" title="跨域框架"></iframe><iframe id="blank-frame" srcdoc="<!doctype html><style>body{background:#fff;color:#111;min-height:500px}</style><body>内联 iframe 内容</body>" title="内联框架"></iframe>' : ""}
  </main>${pathname === "/other" ? '<style class="darkreader">/* another engine */</style>' : ""}</body></html>`;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost:4173");
  const name = url.pathname.slice(1);
  if (["lab.css", "lab.js", "lab-hero.svg", "media.css", "media.js", "media.svg", "media.webm"].includes(name)) {
    response.writeHead(200, { "Content-Type": name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : name.endsWith(".webm") ? "video/webm" : "image/svg+xml" });
    response.end(await readFile(new URL(name, assets))); return;
  }
  if (["lab", "frame-lab", "transparent", "split-login", "strict-style", "canvas-fallback", "media"].includes(name)) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; frame-src 'self' http://localhost:4173; object-src 'none'" });
    if (name === "transparent") {
      response.end('<!doctype html><html><head><title>透明画布</title></head><body>透明根与透明主体</body></html>'); return;
    }
    if (name === "media") {
      response.end(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>媒体保护回归</title><link rel="stylesheet" href="/media.css"><script src="/media.js" defer></script></head><body><h1>内容与界面分开处理</h1><main><picture><source srcset="/media.svg"><img id="content-photo" src="/media.svg" alt="文章中的照片"></picture><video id="content-video" poster="/media.svg" aria-label="内容视频"></video><canvas id="content-canvas" width="160" height="100"></canvas><img id="decorative" src="/media.svg" alt="抽象装饰背景"><img id="empty-alt" src="/media.svg" alt=""><img id="brand-logo" src="/media.svg" alt="品牌 logo"><img id="small" src="/media.svg" alt="小图标"><img id="presentational" role="presentation" src="/media.svg" alt="展示用"><img id="authored" src="/media.svg" alt="已有滤镜的照片"><div id="background"></div><svg id="inline-svg" viewBox="0 0 160 100"><path fill="white" d="M0 0h160v100H0z"/></svg></main><button id="add-media">添加动态媒体</button><button id="dialog-open">打开媒体对话框</button><button popovertarget="popover" id="popover-open">打开媒体 Popover</button><button id="screen-open">全屏容器</button><button id="video-open">全屏视频</button><dialog id="dialog"><img id="dialog-photo" src="/media.svg" alt="对话框照片"><button id="dialog-close">关闭</button></dialog><div id="popover" popover><img id="popover-photo" src="/media.svg" alt="弹出照片"></div><div id="screen"><img id="screen-photo" src="/media.svg" alt="全屏容器内照片"></div></body></html>`); return;
    }
    if (name === "canvas-fallback") {
      response.end('<!doctype html><html><head><title>画布不能冒充原生深色</title><link rel="stylesheet" href="/lab.css"><script src="/canvas-fallback.js" defer></script></head><body class="canvas-fallback"><canvas id="full-canvas"></canvas><div id="canvas-mask"></div></body></html>'); return;
    }
    if (name === "frame-lab") {
      response.end('<!doctype html><html><head><link rel="stylesheet" href="/lab.css"><title>Frame</title></head><body>白底 iframe</body></html>'); return;
    }
    if (name === "split-login") {
      response.end(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>统一反色 · 大背景回归</title><link rel="stylesheet" href="/lab.css"></head><body class="login-demo"><header class="announcement">新一代 AI 服务，简单而可靠。　查看最新动态 ↗</header><main class="split"><section class="login-panel"><svg id="brand-logo" viewBox="0 0 150 30" aria-label="黑色品牌标志"><path fill="black" d="M0 0h30v8H19v22h-8V8H0z"/><text x="40" y="22" font-size="20" fill="black">SYSTEM</text></svg><div class="login-form"><h1>欢迎回来</h1><p>整页保持同一套明暗关系。</p><label>邮箱<input id="login-input" placeholder="name@example.com"></label><button type="button">继续 →</button><small>仅视觉回归，不连接任何账号服务。</small></div></section><section class="visual-panel"><img id="large-hero" src="/lab-hero.svg" alt="明亮的抽象装饰背景"></section></main></body></html>`); return;
    }
    response.end(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>整页滤镜边界测试</title><link rel="stylesheet" href="/lab.css"><script src="/lab.js" defer></script></head><body><div id="fixed">固定导航</div><main class="lab"><h1>统一变换测试</h1><div class="samples"><div id="white">白色表面</div><div id="black">黑色表面</div><div id="gray">灰色表面</div><div id="gradient-test"></div><img id="lab-image" src="/lab-hero.svg" alt="图片"><div id="lab-background"></div><canvas id="lab-canvas" width="120" height="80"></canvas><video id="lab-video" poster="/lab-hero.svg"></video><svg id="lab-svg" viewBox="0 0 120 80"><rect width="120" height="80" fill="white"/></svg><input id="lab-input" placeholder="正常输入"></div><button id="dialog-open">打开对话框</button><button id="popover-open" popovertarget="lab-popover">打开 Popover</button><button id="fullscreen-open">打开全屏</button><dialog id="lab-dialog">对话框<button id="dialog-close">关闭</button></dialog><div id="lab-popover" popover>Popover</div><div id="fullscreen-box">全屏白色表面</div><div id="closed-shadow"></div><iframe id="lab-same" src="/frame-lab" title="同源"></iframe><iframe id="lab-cross" src="http://localhost:4173/frame-lab" title="跨域"></iframe><iframe id="lab-srcdoc" srcdoc="<!doctype html><body>透明画布 iframe</body>" title="srcdoc"></iframe><div class="scroll-space"></div></main></body></html>`); return;
  }
  if (name === "canvas-fallback.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" });
    response.end('const c=document.querySelector("canvas");c.width=innerWidth;c.height=innerHeight;const ctx=c.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,c.width,c.height);'); return;
  }
  if (name === "favicon.ico") { response.writeHead(204).end(); return; }
  if (name === "slow.js") { setTimeout(() => { response.writeHead(200, { "Content-Type": "text/javascript" }); response.end("/* delayed page dependency */"); }, 2200); return; }
  const types = { "site.css": "text/css", "site.js": "text/javascript", "photo.svg": "image/svg+xml" };
  if (types[name]) {
    response.writeHead(200, { "Content-Type": types[name] }); response.end(await readFile(new URL(name, assets))); return;
  }
  if (name === "external.css") {
    response.writeHead(200, { "Content-Type": "text/css" });
    response.end("#external-target { background: #ffffff; color: #111111; border: 1px solid #bbbbbb; padding: 24px; margin-top: 12px; }"); return;
  }
  if (name === "not-css") { response.writeHead(200, { "Content-Type": "text/html" }); response.end("<h1>Not CSS</h1>"); return; }
  if (name === "redirect.css") { response.writeHead(302, { Location: "/metadata.css" }); response.end(); return; }
  if (name === "large.css") { response.writeHead(200, { "Content-Type": "text/css" }); response.end(" ".repeat(2 * 1024 * 1024 + 1)); return; }
  if (name === "metadata.css") {
    response.writeHead(200, { "Content-Type": "text/css" }); response.end(`/*cookie=${request.headers.cookie || ""};referer=${request.headers.referer || ""}*/ body { color: black; }`); return;
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "default-src 'self' http://localhost:4173; script-src 'self'; style-src 'self' 'unsafe-inline' http://localhost:4173 https://assets.systemshade.example; img-src 'self' data:; frame-src 'self' http://localhost:4173; object-src 'none'" });
  response.end(fixture(url.pathname));
});
server.listen(4173, "127.0.0.1", () => console.log("测试与演示：http://127.0.0.1:4173/plain"));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
