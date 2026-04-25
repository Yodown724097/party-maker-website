p = r'c:\Users\Administrator\WorkBuddy\20260423171832\party-maker-website\build_pages.py'
with open(p, 'r', encoding='utf-8') as f:
    c = f.read()

old = "['sku']"
new = "['id']"
count = c.count(old)
c = c.replace(old, new)

with open(p, 'w', encoding='utf-8') as f:
    f.write(c)
print(f'replaced {count} occurrences: [sku] -> [id]')
