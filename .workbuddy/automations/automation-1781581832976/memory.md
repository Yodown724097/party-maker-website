# Weekly Sitemap Refresh — Execution History

## ⚠️ MIGRATED TO VPS — 2026-07-13
This automation is now **disabled** locally. The sitemap refresh runs on VPS (49.234.48.68):
- Script: `/root/scripts/sitemap_refresh.sh`
- Cron: `0 8 * * 1` (Monday 8 AM Beijing)
- Log: `/root/sitemap_refresh.log`

## 2026-07-13 (last local run before migration)
- **Sitemap**: Regenerated — 902 URLs. 0 changed products → dates unchanged (smart mode)
- **Robots.txt**: Unchanged, sitemap reference present ✓
- **Google Ping**: HTTP 404 (endpoint deprecated) 
- **Bing Ping**: HTTP 410 Gone (endpoint deprecated)
- **Git**: Committed .build_cache.json, pushed to main ✓

## 2026-06-29
- **Sitemap**: Regenerated — 900 URLs. Lastmod preserved (smart mode: 0 changed products → dates unchanged from prior build)
- **Robots.txt**: Unchanged, sitemap reference present ✓
- **Google Ping**: HTTP 000 / TLS error (endpoint dead) 
- **Bing Ping**: HTTP 000 / TLS error (endpoint dead)
- **Git**: Committed .build_cache.json, pushed to main ✓
- **Note**: Google/Bing ping endpoints fully offline. Discovery via robots.txt + Search Console is the current mechanism.

## 2026-06-22
- **Sitemap**: Regenerated via build_pages.py — 882 URLs, lastmod 2026-06-22 ✓
- **Robots.txt**: Confirmed sitemap reference present ✓
- **Google Ping**: HTTP 404 (endpoint deprecated since 2023) — expected
- **Bing Ping**: HTTP 410 Gone (endpoint deprecated) — expected
- **Git**: Committed and pushed to main ✓
- **Note**: Google/Bing discover sitemap via robots.txt + Search Console; ping endpoints no longer functional.
