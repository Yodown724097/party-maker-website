"""修复分类名：LED light -> LED Light, Food Strorage -> Food Storage"""
import sys, json
sys.stdout.reconfigure(encoding='utf-8')

with open(r'C:\Users\Administrator\WorkBuddy\20260423091746\party-maker-website\products.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

products = data.get('products', data) if isinstance(data, dict) else data
fix1 = 0; fix2 = 0
for p in products:
    sub = p.get('subcategory', '')
    if sub == 'LED light':
        p['subcategory'] = 'LED Light'
        fix1 += 1
        print(f'LED: SKU {p["sku"]} -> LED Light')
    elif sub == 'Food Strorage':
        p['subcategory'] = 'Food Storage'
        fix2 += 1

with open(r'C:\Users\Administrator\WorkBuddy\20260423091746\party-maker-website\products.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f'\nDone: LED light->LED Light: {fix1}, Food Strorage->Food Storage: {fix2}')
