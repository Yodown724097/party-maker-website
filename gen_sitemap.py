"""Generate sitemap.xml from products.json"""
import json
from datetime import date

PRODUCTS_PATH = r'C:\Users\Administrator\WorkBuddy\20260423091746\party-maker-website\products.json'
SITEMAP_PATH = r'C:\Users\Administrator\WorkBuddy\20260423091746\party-maker-website\sitemap.xml'
BASE_URL = 'https://partymaker.cn'

with open(PRODUCTS_PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)

products = data.get('products', data)
structure = {}  # theme -> set of subcategories
for p in products:
    theme = (p.get('theme') or 'Other').strip()
    subcat = (p.get('subcategory') or 'General').strip()
    if theme not in structure:
        structure[theme] = set()
    structure[theme].add(subcat)

today = date.today().isoformat()
urls = []

# Homepage
urls.append(('https://partymaker.cn/', today, 'weekly', '1.0'))

# Sort: Ramadan first, then alphabetical
themes = sorted(structure.keys(), key=lambda t: (0 if t == 'Ramadan' else 1, t))

for theme in themes:
    # Theme page
    urls.append((f'{BASE_URL}/#{theme}', today, 'weekly', '0.8'))
    # Subcategory pages
    for subcat in sorted(structure[theme]):
        urls.append((f'{BASE_URL}/#{theme}/{subcat}', today, 'weekly', '0.6'))

# Build XML
lines = ['<?xml version="1.0" encoding="UTF-8"?>']
lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
for loc, lastmod, freq, pri in urls:
    lines.append('    <url>')
    lines.append(f'        <loc>{loc}</loc>')
    lines.append(f'        <lastmod>{lastmod}</lastmod>')
    lines.append(f'        <changefreq>{freq}</changefreq>')
    lines.append(f'        <priority>{pri}</priority>')
    lines.append('    </url>')
lines.append('</urlset>')

xml = '\n'.join(lines) + '\n'
with open(SITEMAP_PATH, 'w', encoding='utf-8') as f:
    f.write(xml)

total = len(urls)
theme_count = len(themes)
subcat_count = total - 1 - theme_count  # minus homepage minus theme pages
print(f'Done: {total} URLs ({theme_count} themes + {subcat_count} subcategories + 1 homepage)')
