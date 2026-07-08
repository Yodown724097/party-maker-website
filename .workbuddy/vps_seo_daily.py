#!/usr/bin/env python3
"""
VPS Daily SEO Deploy Script
- Pulls latest seo_queue.json from git
- Takes 24 products from the queue
- Updates products.json with new seo_desc
- Runs build_pages.py
- Git commit + push
- Updates content_progress.json and trims seo_queue.json

Usage: python3 vps_seo_daily.py [--batch-size 24]
Cron: 0 8 * * * cd /path/to/repo && python3 .workbuddy/vps_seo_daily.py
"""

import json, sys, os, subprocess
from datetime import datetime

BATCH_SIZE = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == '--batch-size' else 24
QUEUE_FILE = '.workbuddy/seo_queue.json'
PROGRESS_FILE = '.workbuddy/content_progress.json'
PRODUCTS_FILE = 'products.json'

def run(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=os.path.dirname(os.path.abspath(__file__)) + '/..')
    if result.returncode != 0:
        print(f"ERROR: {cmd}\n{result.stderr}")
        sys.exit(1)
    return result.stdout.strip()

# 1. Pull latest
print("[1] git pull...")
run("git pull origin main")

# 2. Load queue
if not os.path.exists(QUEUE_FILE):
    print("No seo_queue.json found. Nothing to deploy.")
    sys.exit(0)

with open(QUEUE_FILE, 'r', encoding='utf-8') as f:
    queue = json.load(f)

if not queue:
    print("Queue is empty. All done!")
    sys.exit(0)

# 3. Take batch
queue_items = list(queue.items())
batch = queue_items[:BATCH_SIZE]
remaining = queue_items[BATCH_SIZE:]

print(f"[2] Taking {len(batch)} products from queue ({len(remaining)} remaining)")

# 4. Load products.json
with open(PRODUCTS_FILE, 'r', encoding='utf-8') as f:
    data = json.load(f)

products = data['products']
updated = 0
batch_skus = []

for sku, seo_desc in batch:
    sku_str = str(sku)
    found = False
    for p in products:
        if str(p.get('sku', '')) == sku_str:
            p['seo_desc'] = seo_desc
            updated += 1
            batch_skus.append(sku_str)
            found = True
            break
    if not found:
        print(f"  WARNING: SKU {sku_str} not found in products.json")

print(f"[3] Updated {updated} products in products.json")

# 5. Write back products.json
with open(PRODUCTS_FILE, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

# 6. Update progress
prog = {"batch": 0, "total_enriched": 0, "enriched_skus": []}
if os.path.exists(PROGRESS_FILE):
    with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
        prog = json.load(f)

prog['batch'] = prog.get('batch', 0) + 1
existing = set(str(s) for s in prog.get('enriched_skus', []))
existing.update(batch_skus)
prog['enriched_skus'] = sorted(existing)
prog['total_enriched'] = len(prog['enriched_skus'])

with open(PROGRESS_FILE, 'w', encoding='utf-8') as f:
    json.dump(prog, f, ensure_ascii=False, indent=2)

print(f"[4] Progress: batch={prog['batch']}, total={prog['total_enriched']}")

# 7. Update queue file (remove deployed items)
new_queue = dict(remaining)
with open(QUEUE_FILE, 'w', encoding='utf-8') as f:
    json.dump(new_queue, f, ensure_ascii=False, indent=2)

# 8. Build pages
print("[5] Running build_pages.py...")
run("python3 build_pages.py")

# 9. Git add & commit
today = datetime.now().strftime('%Y-%m-%d')
run(f"git add products.json products-public.json sitemap.xml .build_cache.json .workbuddy/content_progress.json .workbuddy/seo_queue.json")
run(f"git add product/")

commit_msg = f"seo: deploy {len(batch)} enriched descriptions - batch {prog['batch']} ({today})"
run(f'git commit -m "{commit_msg}"')

# 10. Push
print("[6] git push...")
run("git push origin main")

print(f"\nDONE: Deployed {len(batch)} products. {len(remaining)} remaining in queue.")
print(f"Progress: {prog['total_enriched']} / 966 = {prog['total_enriched']/966*100:.1f}%")
print(f"Batch: {prog['batch']}, date: {today}")
