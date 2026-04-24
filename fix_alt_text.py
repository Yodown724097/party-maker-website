"""
fix_alt_text.py — Batch fix image alt text across all product and category HTML pages
Changes:
  product pages: "X photo N" → "X - NN"
  category pages: "X photo  background" → "X - 01"
"""
import re
import os
from pathlib import Path

WEBSITE_DIR = Path(__file__).parent  # party-maker-website/

def fix_product_page(filepath):
    """Product pages: 'X photo N' → 'X - NN'"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    def replace_thumb(m):
        name = m.group(1)
        num = m.group(2)
        return f'alt="{name} - {int(num):02d}"'

    new_content = re.sub(
        r'alt="(.+?) photo (\d)"',
        replace_thumb,
        content
    )

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False

def fix_category_page(filepath):
    """Category pages: 'Name photo  background' → 'Name - 01'"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = re.sub(
        r'alt="(.+?) photo\s+background"',
        r'alt="\1 - 01"',
        content
    )

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False

def main():
    product_count = 0
    category_count = 0
    product_fixed = 0
    category_fixed = 0

    for root, dirs, files in os.walk(WEBSITE_DIR):
        for fname in files:
            if not fname.endswith('.html'):
                continue
            fpath = Path(root) / fname
            rel = Path(root).relative_to(WEBSITE_DIR)
            # Use rel.parts[0] to avoid Windows backslash issues
            first_part = rel.parts[0] if rel.parts else ''

            if first_part == 'product':
                product_count += 1
                if fix_product_page(fpath):
                    product_fixed += 1
            elif first_part in ('ramadan', 'functions'):
                category_count += 1
                if fix_category_page(fpath):
                    category_fixed += 1

    print(f"=== Alt Text Fix Done ===")
    print(f"Product pages scanned: {product_count}, fixed: {product_fixed}")
    print(f"Category pages scanned: {category_count}, fixed: {category_fixed}")

if __name__ == '__main__':
    main()
