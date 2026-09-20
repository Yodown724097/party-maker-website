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

## Performance 快照 (2026-09-11, Search Console 近3月 6/9-9/8)
- 总展现 2392 / 总点击 21 / CTR 0.88% / 加权排名 21.96
- 月度展现 430(6)→711(7)→849(8)→402(9前8天) 趋势向上
- 品牌词占点击 67%/展现 37%（其余为 B2B 买家词获客潜力）
- 设备: Mobile 排名9.61/CTR2.52% 远优于 Desktop 排名25.16/CTR0.47%
- 首页占全站展现 83%(1981); 博客内容页排名(8-10)明显优于产品页
- 英语大市场(美1250/英203/澳71展现)几乎0点击→snippet吸引力短板
- 与方案呼应: P0首页静态化已见效(展现涨); P2 Wholesale词有展现未转化; P1内容补强是下一步重点
- 详见 .workbuddy/memory/2026-09-11.md

## ⚠️ 三仓独立，PM 不在 ERP 的「对齐远端」范围内（2026-09-20 查明并已修）
- 三个仓**完全独立**，连提交邮箱都不同：ERP `yodown724097@gmail.com` / PM `72409@users.noreply.github.com`
- 曾长期漏掉：`align-remote` 技能只对齐 ERP + sync，**PM 整段漏** → 9-11～9-20 十次提交无人拉
- **已修**（workbuddy-sync `2d8de04`）：技能加 PM 章节，口令「对齐远端」= 三仓全对齐
- **PM 与 ERP 的硬差异（别照抄 ERP 流程）**：
  | 项 | ERP | PM |
  |---|---|---|
  | 分支 | `master` | **`main`** |
  | 上游别名 | `github-erp` | **`github-pm-site`** |
  | pull 后收尾 | 要 restart 服务 | **Cloudflare Pages 自动构建，不用管** |
  | 构建产物 | 无 | pull 后**不用跑** build_pages.py（产物已入库）|
- **措辞纪律**：写「**我本地落后 X 个提交**」，禁写「少了 X 个提交」（本地落伍 ≠ 项目落伍）
- **对齐后体检**：`python check_publish_surface.py --online` 需 PASS

## 9-17 批次：安全应急 + 询价购物车 (2026-09-20 盘点确认)
- **线上实测 PASS**（`check_publish_surface.py --online`）：47 内部文件 404、13 对外资源 200、Function 存活
- **sitemap 937 条 lastmod 全为 2026-08-31** —— 双哈希机制生效，模板改动不再污染 lastmod
- **安全事故已处置**：R2 密钥明文在 public 仓库躺 5 个月 → 已吊销改读 .env；新增 `r2_credentials.py`（仓库唯一读密钥处）
- **发布面收口**：`functions/_middleware.js` + `_routes.json` 拦 72 个内部文件（products.json 含 `_costPrice` 成本价）
  - ⚠️ **`_routes.json` 里 `*` 必须在末尾**，否则 Pages 构建静默失败并保留旧版本（`/*.py` 踩过）
  - 守门脚本必跑 `--online`：静态检查绿 ≠ 线上拦住
- **询价购物车**：`cart.js` 单一事实源（localStorage pm_cart_v1），996 详情页可加车；清单可编码进链接换电脑找回；`functions/api/save-list.js` 走 Resend
- **双哈希（改动必知）**：`compute_product_hash`（含 TEMPLATE_VERSION + cart.js 哈希 → 决定是否重建页面）vs `compute_data_hash`（只看产品数据 → 决定 sitemap lastmod）。混在一起会让全站 lastmod 跳变 = 向 Google 误发大改信号
- ⚠️ **遗留未处理**：`.workbuddy/` 31 个文件**仍被 git 跟踪**，只做了线上拦截，public 仓库 clone 仍可读（含 MEMORY/HANDOFF/日志/seo_queue.json）
- ⚠️ 本地无 `.env` → 换机后 R2 上传类脚本需手动填一次凭据

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
