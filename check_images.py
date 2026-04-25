import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\Administrator\WorkBuddy\20260423171832\party-maker-website\products-public.json', 'r', encoding='utf-8') as f:
    d = json.load(f)

products = d['products']
print(f"Total products: {len(products)}")

has_images = sum(1 for p in products if p.get('images') and len(p['images']) > 0)
no_images = sum(1 for p in products if not p.get('images') or len(p['images']) == 0)
print(f"Has images: {has_images}")
print(f"No images: {no_images}")
print()

print("First 10 products:")
for p in products[:10]:
    imgs = p.get('images', [])
    print(f"  {p['id']}: {len(imgs)} images")
    if imgs:
        print(f"    first: {imgs[0][:80]}")

print()
print("Products WITHOUT images (first 20):")
count = 0
for p in products:
    if not p.get('images') or len(p['images']) == 0:
        print(f"  {p['id']}")
        count += 1
        if count >= 20:
            break
