import os
import re
from pathlib import Path

WD = Path(__file__).parent
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
