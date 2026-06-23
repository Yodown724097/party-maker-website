import json
with open('products.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

food_storage = [p for p in data['products'] if p.get('subcategory') == 'Food Storage']
food_storage.sort(key=lambda x: x['price'])

print(f'Total Food Storage products: {len(food_storage)}')
print()
for p in food_storage:
    imgs = len(p.get('images', []))
    tags = ','.join(p.get('tags', []))
    name = p['name'][:75]
    desc = p.get('description', '')[:70]
    sku = p['sku']
    price = p['price']
    print(f"SKU {sku} | ${price:.2f} | {name} | imgs:{imgs} | tags:{tags if tags else '-'} | desc:{desc}")
