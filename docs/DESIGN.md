# 晦明 · Veilume 2.1：整页统一变换方案

日期：2026-10-23（Asia/Shanghai）

## 1. 重构起因与验收目标

早期原型分别处理文字、表单、背景与边框，却保留 URL 图片。双栏登录页中可出现表单变暗、大背景图仍亮、黑色 logo 消失、公告文字失去对比度的问题。这需要调整整体路线，不能只增加个别颜色规则。

目标是**渲染结果一致性优先**：同一网页的文字和装饰使用同一个合成变换，不追求照片原色与任意网站原生主题保真同时成立。媒体变色的代价在弹窗、设置和安装说明中直接提示。

验收：系统深浅切换 → 当前外观识别 → 明确策略 → 整页变换或让位 → 状态解释 → 网站例外 → 设置持久化 → 可逆恢复。除了 Chrome 固有限制，不以“后台已运行”代替实际像素验收。

2.1 提供均衡／低亮两个预设，不增加连续亮度滑块、图片算法、远程规则、账号、统计、云同步、主题商店或 UI 框架。

## 2. 开源与规范参考

| 来源 | 本轮参考 | 取舍 |
| --- | --- | --- |
| [Dark Reader CSS Filter 源码](https://github.com/darkreader/darkreader/blob/main/src/generators/css-filter.ts)（MIT） | 顶层整体反色、色相修正、screen 范围、全屏和默认画布的结构边界 | 借鉴 Filter 思路；不再使用其动态引擎，也不引入网站修补数据库或图片反向滤镜 |
| [Dark Reader 矩阵实现](https://github.com/darkreader/darkreader/blob/main/src/generators/utils/matrix.ts)（MIT） | 反色、对比度与亮度的矩阵顺序 | 验证参数含义；本项目只声明浏览器原生 CSS 滤镜，没有复制矩阵库 |
| [shadcn/ui theming](https://ui.shadcn.com/docs/theming)、[Neutral tokens](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/themes.ts)（MIT） | background/foreground/card/border/ring 语义、中性色层次和紧凑控制 | 原生 CSS 实现相同视觉方向；不引入 React、Radix、Tailwind 或组件运行时 |
| [Filter Effects](https://drafts.fxtf.org/filter-effects/#FilterProperty) | 根滤镜、合成及 containing block 行为 | Chrome 实测固定定位与 top layer，不把规范假设直接当兼容性结论 |
| [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) | 静态 CSS 和隔离内容脚本、匹配范围 | MV3、仅顶层、无 MAIN-world 代理、无远程代码 |

1.0 还调研过 Midnight Lizard 的分角色颜色处理、Stylus 的网站样式管理和 Dark Background and Light Text。本轮没有沿用其细粒度路线，也未打包其代码。

### 路线决策

| 路线 | 优势 | 本需求中的代价 | 结论 |
| --- | --- | --- | --- |
| 逐属性动态改色 | 可分开保护照片和界面 | 背景媒体与界面可能割裂，规则复杂且有漏网点 | 删除 |
| 专站 CSS | 单站能精调 | 维护成本高，无法泛化 | 不建立规则库 |
| 整页纯 invert | 一致、覆盖广 | 所有颜色互补，品牌色明显改变 | 加色相与端点修正 |
| 整页 invert + hue + contrast/brightness | 一套算法覆盖合成画面，代码少、易撤销 | 照片失真、深浅混合页面无法兼顾 | 采用，并明确边界 |

## 3. 变换算法

```css
invert(1) hue-rotate(180deg) contrast(0.88) brightness(0.95)
```

顺序是先反转明暗、再旋转色相以缓和互补色、再压缩端点、最后略降亮度。色相旋转不保证品牌色精确还原，饱和颜色可能截断。

对于灰阶归一化输入 c，输出约为 `0.893 - 0.836c`。纯白落到约 15/255，纯黑落到约 228/255；不是刺眼的纯黑纯白极端。参数固定，保证全页同一规则，没有对颜色、标签或域名分别定制。

实现位于 `engine.css`。静态样式只有根开关、top layer 同算法和透明默认画布输入三部分。没有遍历修改元素背景、重写内联样式或接管网站 CSSOM。

### 两个显示预设

均衡（默认推荐）保持亮度 95%；低亮使用相同算法和对比度，亮度为 82%。只改变一个统一的合成参数，不引入媒体豁免或域名规则。低亮灰阶输出约为 `0.7708 - 0.7216c`，白约 13/255、黑约 197/255。

模式决定何时处理，预设决定如何显示，二者独立。切换预设即时写入本地设置并同步标签页；“恢复推荐”只重置预设。原貌、暂停和原生保护的优先级不变。根元素传递同一个亮度变量给 top layer，iframe 不重复注入。

### 合成边界

- **iframe：** 引擎和控制器只注入顶层。子框架渲染结果随根滤镜一起变换，包括跨域、srcdoc 和嵌套内容，避免双重反色；不读取子框架正文。
- **Shadow DOM：** 合成后统一处理，无需侵入开放或封闭根，也不覆写 attachShadow。
- **对话框、Popover、全屏：** Chrome top layer 不受祖先根滤镜影响，对 `:modal`、`:popover-open`、`:fullscreen` 使用完全相同的滤镜。没有单独色板；模态背景遮罩保留网站行为。
- **默认画布：** html 和 body 都透明时，浏览器默认画布不在滤镜子树内。此时给 html 提供 CSS 系统色 `Canvas` 作为滤镜输入，撤销时也移除它；不是强制覆盖所有网站的根背景。
- **固定布局：** 不包裹、移动或重建网页 DOM；滤镜加在文档根而不是 body。真实 Chrome 中检查滚动前后 fixed 坐标。
- **打印：** 变换限制在 `@media screen`，不改变网站打印规则。

## 4. 当前外观识别，不识别“完美能力”

仍保留原生深色保护，避免把已经是深色的整页反成白色。

1. 在视窗 5×4 网格取样。读取实际背景，向祖先合成透明度；RGB 直接解析，OKLCH / P3 用离屏 1px 纯色块转换为 sRGB。
2. 媒体、背景图、透明命中层和混合模式的实际像素无法由 CSS 背景证明。标为不确定，不将黑色 fallback 或 opacity:0 遮罩当成深色设计。
3. 只有至少 65% 的全部取样点提供可靠深色背景证据、明显亮色点少于 25%、可靠取样平均相对亮度低于 0.22，才保护原生。
4. 可读 CSS 的 media query、color-scheme 和主题属性只作辅助说明；扫描最多 3000 条规则，不下载跨域样式。找不到声明不等于没有能力。

这些是启发式阈值，不是截图视觉模型、网站能力证明或无障碍认证。大媒体、伪元素和混合主题可能误判；用户可以强制反色或恢复本站原貌。

### 不被自己的输出骗过

CSS 滤镜不改元素的原始计算颜色。重检时，同一个 JavaScript 任务内临时移除本插件的属性开关、采样、恢复或撤销，不跨 await 或动画帧，不把插件变暗结果当成原生深色，也没有上版先 disable 再等待的可见重检间隔。第一次载入仍可能闪原色。

## 5. 决策闭环

优先顺序：总暂停 → 本站覆盖全局 → 系统浅色／原貌 → 已知同类引擎冲突 → 已暗保护（可强制忽略）→ 整页反色。

“强制反色”只绕过原生判断，不让已暂停的插件恢复、不绕过本站原貌或系统浅色。深色目标仍是目标，不代表模拟点击网站主题按钮。网站自己锁定深色时，插件原貌不会把它强制变白。

| 状态 | 用户看到的含义 | 恢复／纠正 |
| --- | --- | --- |
| converted | 整页深色已开启 | 选原貌或关闭总开关 |
| native-dark | 页面已经是深色 | 误判可强制反色 |
| system-light / light | 保持网页原貌 | 深色目标时再处理 |
| site-off / disabled | 本站原貌／全局暂停 | 重置本站／开启总开关 |
| restricted / unavailable | 浏览器不允许或尚无法连接 | 授权、刷新或换普通网页 |
| other-extension | 已知 Dark Reader 冲突 | 关闭其他同类扩展 |
| error | 根滤镜被网站覆盖等 | 不伪报成功，建议恢复本站原貌 |

## 6. 模块与生命周期

| 文件 | 职责 |
| --- | --- |
| core.js | 纯设置规范化、兼容迁移、主机名、决策、颜色数学 |
| detector.js | 有界能力线索与可靠背景采样 |
| engine.css | 唯一的合成变换算法 |
| content.js | 系统监听、主题重检、属性开关、状态与恢复 |
| background.js | 串行设置写入、徽标、安装前页面按需接入 |
| popup / options | 中文控制、状态解释、例外和边界提示 |

所有运行时脚本位于 ISOLATED world。移除了 vendor、MAIN 代理、CSS 请求队列和运行时依赖。静态 CSS 不依赖页面允许内联样式；严格 CSP 页面有自动回归测试。

body 出现且设置到位即可检测，不必等待慢 defer 脚本。DOMContentLoaded、load、系统外观变化、主题属性／样式改变、焦点／可见性恢复和 BFCache pageshow 触发重检；系统变化后做两次有限收敛检查。最短检测间隔 350ms，没有永久轮询。普通 DOM 和 CSSOM 颜色变化天然通过滤镜，不需要引擎追踪每个节点。

## 7. 数据、交互与安全

配置保存 `enabled`、`mode`、`filterPreset`、`protectNative`、`sites`，schema 为 3；旧设置和损坏预设默认均衡。存储键与消息前缀保留旧版兼容。按完整 hostname 保存稀疏例外，后台队列串行合并，storage 事件同步标签页；拒绝原型键、无效模式和非规范 host。

UI 语义色全部中性，深色背景 #171717、表面 #212121、边框 #363636；浅色白底、#fafafa 表面、#e5e5e5 边框。保留清晰焦点、switch/aria-checked、aria-pressed、aria-live、错误提示和 reduced-motion。弹窗 390px 宽、主要控件在 600px 高度内完整显示；详细说明放设置页。

无运行时网络、远程代码、统计、账号或上传。广泛 host 权限是自动适配未知网站所需；storage 保存偏好；activeTab/scripting 只在弹窗接入旧页面时用。只接受扩展自身 UI 的设置写入消息；网页不提供外部消息入口。文本用 textContent 呈现，不执行页面传来的 HTML。

## 8. 验证、交付与回滚

以真实 Chrome 的截图像素为主要颜色验收，不再用元素 computed background 变暗作为通过标准。覆盖媒体、透明画布、iframe、Shadow DOM、top layer、固定布局、CSP、打印、原生保护、系统切换、偏好同步与移除。真实公网页面对比包括用户问题页和地图；不登录、不发验证码、不提交表单。

发布安装 ZIP、源码 ZIP、校验文件和版本记录。默认不覆盖用户正在加载的扩展目录；升级需替换原目录、重新加载并刷新旧页，保持 ID 与偏好。GitHub CI 验证每次提交；依赖更新只提出 PR，不自动合并。实际结果和边界见 TESTING.md，维护流程见 CONTRIBUTING.md。
