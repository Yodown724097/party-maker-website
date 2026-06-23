"""SEO Description Enrichment Script — Batch 1 of ~15"""
import json, math, os, sys

PRODUCTS_PATH = 'D:/AI/Work Buddy files/party-maker-website/products.json'
PROGRESS_PATH = 'D:/AI/Work Buddy files/party-maker-website/.workbuddy/content_progress.json'
BATCH_SIZE = 24

TEMPLATE_PHRASES = ['This beautiful','Make this','Bring','Stunning','Perfect for','Amazing','Wonderful']

def is_unoptimized(seo_desc):
    if not seo_desc or len(seo_desc) < 50:
        return True
    return any(t in seo_desc for t in TEMPLATE_PHRASES)

def generate_seo_desc(p):
    """Generate a unique, data-driven seo_desc from actual product fields."""
    name = p['name']
    theme = p.get('theme', 'Party')
    subcat = p.get('subcategory', '')
    price = float(p.get('price', 0))
    desc = p.get('description', '').strip()
    tags = p.get('tags', [])
    is_hot = 'hot' in tags
    pcs_per_ctn = p.get('_pcsPerCtn')
    cbm = p.get('_cbm')

    # Line 1: Product identity
    lines = [f"{name} is a {theme} {subcat} product, factory-direct from Yiwu, China."]

    # Line 2: Description from real data
    if desc:
        lines.append(f"Specs: {desc}.")

    # Line 3: Price analysis
    retail_low = round(price * 2.8, 2)
    retail_high = round(price * 3.5, 2)
    margin = round((price * 2.8 - price) / price * 100) if price > 0 else 0
    lines.append(f"Wholesale ${price:.2f}/unit; suggested retail ${retail_low:.2f}–${retail_high:.2f}, yielding ~{margin}% retail margin.")

    # Line 4: Carton economics
    if pcs_per_ctn and cbm and pcs_per_ctn > 0 and cbm > 0:
        ctn_value = round(pcs_per_ctn * price, 2)
        pcs_per_cbm = round(pcs_per_ctn / cbm)
        lines.append(f"Ships {int(pcs_per_ctn)} pcs per carton (carton value ${ctn_value:.2f}), CBM {cbm}, approx {pcs_per_cbm} units per cubic meter.")

    # Line 5: Hot seller tag
    if is_hot:
        lines.append("Tagged as a hot seller based on 2026 buyer activity.")

    # Line 6: Standard closing
    lines.append("No MOQ for spot goods. Custom from 600 pcs with private labeling. Global shipping. Contact info@partymaker.cn.")

    return ' '.join(lines)

# ── Main ──────────────────────────────────────────────
with open(PRODUCTS_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

products = data['products']

# Find unoptimized
unoptimized = []
for i, p in enumerate(products):
    if is_unoptimized(p.get('seo_desc', '')):
        unoptimized.append(i)

print(f"Found {len(unoptimized)} unoptimized products")

# Sort by priority
def priority_key(idx):
    p = products[idx]
    is_hot = 'hot' in (p.get('tags') or [])
    has_img = len(p.get('images', [])) > 0
    has_packing = bool(p.get('_pcsPerCtn') and p.get('_cbm'))

    if is_hot and has_img:
        return (0, idx)
    elif has_packing:
        return (1, idx)
    elif has_img:
        return (2, idx)
    else:
        return (3, idx)

unoptimized.sort(key=priority_key)

# Today's batch
batch_indices = unoptimized[:BATCH_SIZE]
print(f"Today's batch: {len(batch_indices)} products")

# Load existing progress
if os.path.exists(PROGRESS_PATH):
    with open(PROGRESS_PATH, 'r', encoding='utf-8') as f:
        progress = json.load(f)
else:
    progress = {"batch": 0, "total_enriched": 0, "enriched_skus": []}

# Enrich each product
enriched_skus = []
for idx in batch_indices:
    p = products[idx]
    old_desc = p.get('seo_desc', '')
    new_desc = generate_seo_desc(p)
    p['seo_desc'] = new_desc
    enriched_skus.append(p['sku'])

    # Print diff for review
    print(f"\n[{p['sku']}] {p['name'][:50]}")
    print(f"  OLD: {old_desc[:100]}...")
    print(f"  NEW: {new_desc[:150]}...")

# Update progress
progress['batch'] = progress.get('batch', 0) + 1
progress['total_enriched'] = progress.get('total_enriched', 0) + len(enriched_skus)
progress['enriched_skus'].extend(enriched_skus)

# Save
with open(PRODUCTS_PATH, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

with open(PROGRESS_PATH, 'w', encoding='utf-8') as f:
    json.dump(progress, f, ensure_ascii=False, indent=2)

print(f"\n✅ Batch {progress['batch']} complete. Total enriched: {progress['total_enriched']}")
print(f"   SKUs enriched: {len(enriched_skus)}")
