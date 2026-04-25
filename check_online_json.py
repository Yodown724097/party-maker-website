import urllib.request
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

url = 'https://www.partymaker.cn/products-public.json'
req = urllib.request.Request(url, headers={'Cache-Control': 'no-cache'})
with urllib.request.urlopen(req, timeout=15) as r:
    d = json.loads(r.read())

products = d['products']
print(f"Total products: {len(products)}")

has_images = sum(1 for p in products if p.get('images') and len(p['images'])>0)
no_images = sum(1 for p in products if not p.get('images') or len(p['images'])==0)
print(f"Has images: {has_images}")
print(f"No images: {no_images}")
print()

print("First 5 products:")
for p in products[:5]:
    imgs = p.get('images', [])
    print(f"  {p['id']}: images count={len(imgs)}")

print()
print("Last 5 products:")
for p in products[-5:]:
    imgs = p.get('images', [])
    print(f"  {p['id']}: images count={len(imgs)}")

print()
print("Sample products with images:")
count = 0
for p in products:
    if p.get('images') and len(p['images']) > 0:
        print(f"  {p['id']}: {p['images'][0]}")
        count += 1
        if count >= 5:
            break
