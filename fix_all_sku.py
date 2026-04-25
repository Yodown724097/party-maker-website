p = r'c:\Users\Administrator\WorkBuddy\20260423171832\party-maker-website\build_pages.py'
with open(p, 'r', encoding='utf-8') as f:
    c = f.read()

# 替换所有 sku 字典键访问
fixes = [
    ("p['sku']", "p['id']"),
    ('p["sku"]', 'p["id"]'),
    ("product['sku']", "product['id']"),
    ('product["sku"]', 'product["id"]'),
]
total = 0
for old, new in fixes:
    cnt = c.count(old)
    c = c.replace(old, new)
    total += cnt
    if cnt:
        print(f'  replaced {cnt}x: {old} -> {new}')

with open(p, 'w', encoding='utf-8') as f:
    f.write(c)
print(f'\nTotal replaced: {total}')
