# 第三方与开源参考 · 晦明 Veilume

本版安装包不含第三方 JavaScript 库。1.0 的 Dark Reader 4.9.133 依赖、构建适配、vendor 文件和 MAIN 代理已移除；旧版归档仍遵守其原有 MIT 说明。

## 本版参考，未打包组件代码

- [Dark Reader](https://github.com/darkreader/darkreader)（MIT）：阅读 CSS Filter 生成器和滤镜矩阵，参考整页 invert / hue-rotate 的公开算法与合成边界。本版使用独立编写的 CSS 声明和控制代码，不含上游引擎或站点修补规则。
- [shadcn/ui](https://github.com/shadcn-ui/ui)（MIT）：参考 Neutral 主题的语义 token 组织和黑白灰风格；本版用原生 HTML/CSS 实现，不包含 React、Radix 或 shadcn 组件。
- [Chrome Extensions 文档](https://developer.chrome.com/docs/extensions/) 与 [Filter Effects 规范](https://drafts.fxtf.org/filter-effects/)：参考 MV3、安全边界和浏览器滤镜行为。
- Midnight Lizard（MIT）、Stylus（GPL-3.0）与 Dark Background and Light Text（MPL-2.0）只作上版路线对照，未复制或打包代码。

整页 CSS 滤镜由浏览器实现，不是下载的远程算法。晦明的策略、识别、交互、图标与测试由本项目实现；不隶属于上述开源项目，不使用其商标背书。本项目自身以 MIT 许可发布，见 LICENSE。

## 仅开发测试依赖

`@playwright/test` 1.64.1 及其 Playwright 依赖（Apache-2.0）只用于测试，不进入 Chrome 安装包。精确版本和完整性见 package-lock.json；许可随 npm 包保留。

参考资料获取：2026-10-22；本版更新：2026-10-23。无远程字体、图标 CDN、规则下载或运行时第三方服务。
