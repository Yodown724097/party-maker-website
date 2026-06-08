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

## Build System Notes
- `build_pages.py` generates: product pages, category pages, sitemap.xml, robots.txt, products-public.json
- `fp-render` inline script in index.html has JS syntax bug (missing `+` operator between string concatenations) — fixed 2026-06-05
- Sitemap lastmod is hardcoded to build date, should be updated on each deploy
