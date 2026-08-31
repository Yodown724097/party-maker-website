# Partymaker-website Memory

## SEO Status (as of 2026-08-31, 老板从 Search Console 后台实时确认)
- **Indexed**: 217（6/8 是 ~106 → 已涨一倍多，15:01 老板当面核对）
- **Coverage Issues 明细（老板后台截图）**:
  - 585 "Discovered - currently not indexed" (最大头, Google 知道 URL 但因无内链权重不爬 → 首页断头路根因)
  - 160 "Crawled - currently not indexed" (Google 爬了但拒收 → 疑似重复/薄内容)
  - 24 "Alternate page with proper canonical tag"
  - 17 "Page with redirect"
  - 6 "Duplicate without user-selected canonical"
  - 3 "Server error (5xx)" (待查具体URL)
- **趋势**: 6/8 的 884 Discovered→ 现 585（首页问题可能在改善或统计口径变）；Crawled 62→160 涨（重复内容信号上升）
- **已配置**: Search Console + Analytics 均已连接生效
- **On-page SEO**: Product/category pages have proper title, meta description, canonical, h1, robots index/follow
- **Sitemap**: 1000 URLs submitted, lastmod 2026-04-30 (stale)
- **robots.txt**: Clean, allows all

## R2 Image Issues
- Some networks (specific Edge/browser configs) cannot access `pub-1fd965ab66464286847edcb540254451.r2.dev` → `ERR_CONNECTION_REFUSED`
- Chrome works, some Edge instances fail — likely proxy/VPN/DNS routing issue
- R2 public access domain may be intermittently blocked in China

## Blog Coverage Progress (as of 2026-07-08)
- 17 total blog posts generated
- ✅ Bunting (17p) | ✅ Lantern (64p) | ✅ LED Light (184p) | ✅ Deco-Table (73p)
- ✅ Deco-Wood (111p) | ✅ Deco-Hanging (81p) | ✅ Deco (92p)
- ✅ Food Storage (64p) | ✅ Bag (45p, 6/24) | ✅ Wrapping (26p, 6/30)
- ✅ Box (24p, 7/8) | ⬜ Balloon Foil (19p) — next candidate
- ⬜ Napkin (18p) | ⬜ Backdrop (17p) | ⬜ Picks (15p) | ⬜ Candle (14p)
- ⬜ Cupcake (13p) | ⬜ Paper Plate (12p) | ⬜ Garland (8p) + 14 more small subcategories

## Build System Notes
- `build_pages.py` generates: product pages, category pages, sitemap.xml, robots.txt, products-public.json
- `fp-render` inline script in index.html has JS syntax bug (missing `+` operator between string concatenations) — fixed 2026-06-05
- Sitemap lastmod is hardcoded to build date, should be updated on each deploy

## 未来方向：飞书→网站 内容流水线 (2026-08-31 老板确认)
- **老板明确规划**: 后面会用飞书「新品 + 内容推荐」联动本网站，**定时自动更新内容**
- 影响 SEO 方案设计: 不是一次性补文案, 而是建立 **飞书 Base → build_pages.py → 静态页+sitemap → Cloudflare Pages 定时构建**的持续内容管线
- 已有基础(复用): JT/PM 产品库 Base、box 箱单、blog 生成机制、VPS sitemap cron(`/root/scripts/sitemap_refresh.sh` 每周一8点)
- **联动架构已clarify**: 博客数据源=`blog.json`(字段 slug/title/meta_desc/date/category/image/body); 飞书导入可完全复用 `import_diwali.py` 模式(飞书拉数据→写JSON→build_pages.py→push)
- 设计原则: 一次建管线, 新品/新文/新推荐自动落站+sitemap+ping, 不再手工

## SEO 工程四阶段 (2026-08-31 定案, 老板拍板分级负责)
- **P0 首页结构打通**: ✅ 已上线 `cbe7fdf`(首页+22静态分类链接, 治585 Discovered)
- **P1 内容补强**: 飞书联动线(老板+另一对话) - 补800+薄描述, 埋B2B词, 治160 Crawled
- **P2 关键词卡位**: workbuddy(SZ)负责 - 基于Performance数据抓长尾词, 治曝光/排名低
- **P3 飞书内容流水线**: 飞书联动线 - 定时新品/推荐自动落站, 持续曝光治本
- **三条铁律**: ①不碰已收录217页 ②预判Google反应(防AI薄内容/关键词堆砌) ③每步独立commit可回滚

## VPS Sitemap Cron (as of 2026-07-13)
- Weekly sitemap refresh runs on VPS 49.234.48.68
- Script: `/root/scripts/sitemap_refresh.sh` (git pull → build_pages.py → ping → git push)
- Cron: `0 8 * * 1` (every Monday 8:00 AM Beijing)
- Log: `/root/sitemap_refresh.log`
- Repo: `/root/party-maker-website/` (shallow clone, git@github-pm-site remote)
- Local WorkBuddy automation `automation-1781581832976` PAUSED

## Git Rules (DO NOT BREAK)
- **NEVER `git add -A`** — node_modules 有 11000+ 文件，会卡死 push
- 提交前确认改动的文件列表，只 add 需要的文件
- 本项目 .gitignore 缺少 node_modules，已加

## 图片架构 (as of 2026-06-26)
- 全站图片统一走 `www.partymaker.cn/img/SKU/file.webp`（通过 Cloudflare Pages Function 代理到 R2）
- `functions/img/[[path]].js` — 图片代理 Function
- build_pages.py 中 `to_proxy()` + `proxy_images()` 负责 URL 转换
- app.js 中 `normalizeImageUrls()` 做前端兜底
- 新增其他 theme 产品时，走 import_diwali.py 的模式：飞书拉数据 → 下载图 → 上传R2 → 写入 products.json → build_pages.py
