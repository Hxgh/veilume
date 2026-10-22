const theme = document.getElementById("native-toggle");
theme?.addEventListener("click", () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
});
document.getElementById("add-content")?.addEventListener("click", () => {
  const card = document.createElement("div");
  card.className = "dynamic-card";
  card.textContent = "动态加载的内容，也参与同一套整页变换。";
  document.querySelector("main").append(card);
});
document.getElementById("add-shadow")?.addEventListener("click", () => {
  const host = document.createElement("shade-sample");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = ".surface {background: white; color: #222; padding: 24px; margin-top: 20px;}";
  const surface = document.createElement("div");
  surface.className = "surface";
  surface.textContent = "开放 Shadow DOM 内容";
  shadow.append(style, surface);
  document.querySelector("main").append(host);
});
document.getElementById("cssom")?.addEventListener("click", () => {
  const style = document.createElement("style");
  document.head.append(style);
  style.sheet.insertRule(".cssom-target { background: #ffffff; color: #111111; padding: 30px; }");
  document.getElementById("cssom-target").className = "cssom-target";
});
const canvas = document.getElementById("canvas");
if (canvas) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e0874b"; ctx.fillRect(0, 0, 40, 40);
  ctx.fillStyle = "#408aab"; ctx.fillRect(40, 0, 40, 40);
}
if (location.pathname === "/late-native") setTimeout(() => document.documentElement.dataset.theme = "dark", 1000);
if (location.pathname === "/style-late") setTimeout(() => {
  const style = document.createElement("style");
  style.textContent = "html, body {background: #15231c; color: #e7eddf} .card {background:#213c2a;color:#e7eddf} p {color:#b6c8af}";
  document.head.append(style);
}, 1400);
