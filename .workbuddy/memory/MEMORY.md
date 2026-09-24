# party-maker-website — 指针表

> 本文件只放**坐标 + 去哪找什么**。细节一律在 `PM-DETAIL.md` 或当日 daily log。
> 别再往这里堆细节（曾超限被注入截断）。

## 项目坐标

| 项 | 值 |
|---|---|
| 本地 | `D:\AI\Work Buddy files\party-maker-website`（分支 **main**）|
| 仓库 | `Yodown724097/party-maker-website`（**public**）|
| 上游别名 | `github-pm-site` |
| 部署 | Cloudflare Pages（**自动构建，pull 后不用跑 build_pages.py**）|
| 站点 | www.partymaker.cn（图片走 `functions/img/[[path]].js` 代理到 R2）|

## 去哪找什么

| 想查什么 | 看哪 |
|---|---|
| SEO 现状 / Performance / 四阶段 / 已收录清单 | `PM-DETAIL.md` §1–3 |
| 大改纪律、双哈希、两个未修 bug | `PM-DETAIL.md` §2 |
| 发布面拦截、`_routes.json` 坑、cart.js | `PM-DETAIL.md` §4 |
| 三仓对齐差异、git 规则 | `PM-DETAIL.md` §5–6 |
| 图片架构 / R2 访问异常 | `PM-DETAIL.md` §7 |
| 博客覆盖进度 / 飞书流水线 / VPS cron | `PM-DETAIL.md` §8–11 |
| hilaldecor 姊妹站 | `PM-DETAIL.md` §12 + `hilaldecor/_tools/` 四份文档 |
| 近期流水 | 本目录 `YYYY-MM-DD.md`（9-20 那份最厚，含 9-20~9-22 连续记录）|

## 三条不许破的线

1. 🛑 **绝不碰已收录 URL**（名单 `indexed_urls_2026-09-20.json`，256 条）—— 老板 9-20 大改指令
2. 🔴 **NEVER `git add -A`**（node_modules 11000+ 文件会卡死）
3. ⚠️ **`_routes.json` 里 `*` 必须放末尾**，否则 Pages 构建静默失败
