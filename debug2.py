import os, re
from pathlib import Path

WD = Path(r'C:\Users\Administrator\WorkBuddy\20260423171832\party-maker-website')
count = 0
for root, dirs, files in os.walk(WD):
    for f in files:
        if f.endswith('.html'):
            rel = Path(root).relative_to(WD)
            if str(rel).startswith('product/'):
                count += 1
                if count <= 3:
                    print(f'OK: {rel}/{f}')

print(f'Total product pages: {count}')

# Test regex on first product page found
for root, dirs, files in os.walk(WD):
    for f in files:
        if f.endswith('.html') and str(Path(root).relative_to(WD)).startswith('product/'):
            fpath = Path(root) / f
            with open(fpath, 'r', encoding='utf-8') as fp:
                content = fp.read()
            # Find all matches
            matches = re.findall(r'alt="(.+?) photo (\d)"', content)
            print(f'File: {f}')
            print(f'Matches: {matches[:5]}')
            break
    else:
        continue
    break
