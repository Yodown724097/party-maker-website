import json
import random

random.seed(42)
with open(r'C:\Users\Administrator\WorkBuddy\20260423091746\party-maker-website\products.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
products = data['products']

samples = random.sample(products, 10)
for p in samples:
    sku = p['sku']
    name = p['name']
    desc = p.get('description', '')
    theme = p.get('theme', '')
    subcat = p.get('subcategory', '')
    print(f'SKU: {sku}')
    print(f'Name: {name}')
    print(f'Desc: {desc}')
    print(f'Theme: {theme} / {subcat}')
    print('---')
