# 安装、分发与更新

核对日期：2026-10-23。当前已有 GitHub Release，**尚未提交或上架 Chrome Web Store**。本地运行是隐私设计，不限制只有开发者本人能安装。

## 三种分发方式

| 方式 | 适用对象 | 安装与更新 |
| --- | --- | --- |
| GitHub 下载并加载解压目录（当前可用） | 自用或愿意信任源码、手动操作的人 | 任何人都能下载；需开发者模式，手动更新，无商店自动更新 |
| Chrome Web Store（下一步可选） | 希望一键安装、浏览器自动更新的用户 | 开发者注册并提交审核，通过后由商店分发与更新 |
| 企业策略自托管 | 由管理员管理的浏览器 | 需要企业管理与策略部署，不是个人电脑上的普通安装捷径 |

普通 Windows／macOS Chrome 不能把 GitHub 上的任意 CRX 当作商店扩展直接安装。不要为此禁用浏览器安全保护；本项目不提供绕过方案。Linux 有额外的打包安装途径，不代表跨平台默认支持。

## 当前安装与升级

下载 `veilume-版本-chrome.zip`，解压得到 `veilume/manifest.json`。Chrome 打开 `chrome://extensions/`，开启开发者模式，选择“加载已解压的扩展程序”，加载 `veilume` 文件夹。无需 Node.js 或联网激活；网页本身是否联网另当别论。

升级请替换原加载目录中的文件，再重新加载扩展、刷新旧页面。路径改变会产生不同扩展 ID；旧例外和偏好不会自动迁移到新 ID。不要同时启用两份扩展。

## 商店可见性并不等于是否开源

- **Public**：可搜索、任何人可安装，适合正式公开发布。
- **Unlisted**：不列入搜索，但知道商店链接的任何人都可安装；适合小范围分享，不是访问控制。
- **Private**：只向指定测试者／适用组织开放，适合严格限定安装者。

三种都需要相同的政策审查，不代表 Unlisted 可以免审核。GitHub 是否公开与商店可见性独立；商店安装能自动更新，GitHub 解压安装不会因此自动升级。

## 已提供的工程材料

执行完整构建、检查和端到端后 `npm run package` 会生成：

- `*-chrome.zip`：含 `veilume/` 文件夹，供手动安装。
- `*-webstore.zip`：`manifest.json` 位于 ZIP 根，供商店开发者后台上传，**不是已签名或已审核的商店安装文件**。
- `*-source.zip`：可独立重建的源码，不含依赖、日常浏览资料或真实网站测试结果。
- `SHA256SUMS.txt`：三份 ZIP 的校验值；打包时核验两种扩展 ZIP 的完整文件清单与每个文件字节。
- `store/icon128.png`、两张 1280×800 的 `store/*.png`：品牌图标及真实插件／本地合成页面截图，不含用户账号。
- [隐私声明](../PRIVACY.md)与[商店文案、权限说明、审核步骤](STORE_LISTING.md)。

## 仍需项目所有者完成的外部环节

1. 使用自己的 Google 账号注册开发者、接受条款并支付后台要求的一次性注册费，完成联系邮箱和账号验证。不要将登录凭证或支付资料交给源码或 CI。
2. 确认发布者身份、公开联系方式、地区、隐私申报和 Public／Unlisted／Private 选择。
3. 上传 `*-webstore.zip` 与材料，核对声明后主动提交审核。是否通过和何时通过由 Chrome 商店决定，代码与 ZIP 校验不等于审核通过。
4. 获得真实商店条目 ID 后，才在 README 添加安装链接。首次商店安装与本地加载 ID 通常不同，设置不自动迁移；先停用旧扩展。

本项目没有接入商店凭证、付费、自动提交或自动发布，也不会在无人确认时替换用户浏览器里的扩展。

## 官方依据

- [支持的分发方式及平台限制](https://developer.chrome.com/docs/extensions/how-to/distribute)
- [Public、Unlisted、Private](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
- [开发者注册](https://developer.chrome.com/docs/webstore/register/)
- [ZIP 根目录要求](https://developer.chrome.com/docs/webstore/prepare)
- [图标与截图要求](https://developer.chrome.com/docs/webstore/images)
