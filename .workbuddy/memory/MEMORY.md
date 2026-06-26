# Partymaker-website Memory

## SEO Status (as of 2026-06-08)
- **Indexed**: ~106 / 1000+ pages
- **Coverage Issues**:
  - 884 "Discovered - currently not indexed" (biggest problem — Google knows but won't crawl)
  - 62 "Crawled - currently not indexed" (Google crawled but rejected)
  - 47 "Blocked by robots.txt" (robots.txt now clean, likely cached old version)
  - 8 "Duplicate without user-selected canonical"
  - 4 "Server error (5xx)"
  - 5 "Excluded by 'noindex' tag"
- **Trend**: Slowly improving (7 indexed on 4/24 → 106 on 5/29)
- **On-page SEO**: Product/category pages have proper title, meta description, canonical, h1, robots index/follow
- **Sitemap**: 1000 URLs submitted, lastmod 2026-04-30 (stale)
- **robots.txt**: Clean, allows all

## R2 Image Issues
- Some networks (specific Edge/browser configs) cannot access `pub-1fd965ab66464286847edcb540254451.r2.dev` → `ERR_CONNECTION_REFUSED`
- Chrome works, some Edge instances fail — likely proxy/VPN/DNS routing issue
- R2 public access domain may be intermittently blocked in China

## Blog Coverage Progress (as of 2026-06-24)
- 15 total blog posts generated
- ✅ Bunting (17p) | ✅ Lantern (64p) | ✅ LED Light (184p) | ✅ Deco-Table (73p)
- ✅ Deco-Wood (111p) | ✅ Deco-Hanging (81p) | ✅ Deco (92p)
- ✅ Food Storage (64p) | ✅ Bag (45p, 6/24)
- ⬜ Wrapping (26p) | ⬜ Box (24p) | ⬜ Backdrop (17p)
- ⬜ Balloon Foil (19p) | ⬜ Napkin (18p) | ⬜ Picks (15p) | ⬜ Candle (14p)
- ⬜ Cupcake (13p) | ⬜ Paper Plate (12p) | ⬜ Garland (8p) + 14 more small subcategories

## Build System Notes
- `build_pages.py` generates: product pages, category pages, sitemap.xml, robots.txt, products-public.json
- `fp-render` inline script in index.html has JS syntax bug (missing `+` operator between string concatenations) — fixed 2026-06-05
- Sitemap lastmod is hardcoded to build date, should be updated on each deploy

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
