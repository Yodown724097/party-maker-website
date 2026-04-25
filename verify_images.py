import json

# Quick check: does products-public.json have images?
with open(r'c:\Users\Administrator\WorkBuddy\20260423171832\party-maker-website\products-public.json', 'r', encoding='utf-8') as f:
    d = json.load(f)

products = d['products']
print(f"Total: {len(products)}")

has_img = sum(1 for p in products if p.get('images') and len(p['images']) > 0)
no_img = len(products) - has_img
print(f"Has images: {has_img}")
print(f"No images: {no_img}")

# Show first 5 and last 5
print("\nFirst 5:")
for p in products[:5]:
    print(f"  {p['id']}: {len(p.get('images',[]))} images")

print("\nLast 5:")
for p in products[-5:]:
    print(f"  {p['id']}: {len(p.get('images',[]))} images")

# Check if any product has images but the URL is broken
print("\nChecking image URLs (first 5 with images):")
count = 0
for p in products:
    if p.get('images') and len(p['images']) > 0:
        print(f"  {p['id']}: {p['images'][0][:80]}")
        count += 1
        if count >= 5:
            break
