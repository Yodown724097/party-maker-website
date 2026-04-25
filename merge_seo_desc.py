"""
Merge seo_desc from review Excel back into products.json.
Adds a 'seo_desc' field to each product.
"""

import json
import openpyxl
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEBSITE_DIR = BASE_DIR
PRODUCTS_JSON = os.path.join(BASE_DIR, 'products.json')
SEO_XLSX = os.path.join(BASE_DIR, '..', 'seo_desc_review.xlsx')

def main():
    # Load Excel
    print("Loading SEO descriptions from Excel...")
    wb = openpyxl.load_workbook(SEO_XLSX)
    ws = wb['SEO Descriptions']
    
    seo_map = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0] is None:
            continue
        sku = str(row[0]).strip()
        seo_desc = str(row[5]).strip() if row[5] else ''
        seo_map[sku] = seo_desc
    
    print(f"  Found {len(seo_map)} SEO descriptions in Excel")
    
    # Load products.json
    print("Loading products.json...")
    with open(PRODUCTS_JSON, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    products = data['products']
    matched = 0
    for p in products:
        sku = str(p.get('sku') or p.get('id', ''))
        if sku in seo_map:
            p['seo_desc'] = seo_map[sku]
            matched += 1
    
    print(f"  Matched {matched}/{len(products)} products")
    
    # Save
    print("Saving products.json...")
    with open(PRODUCTS_JSON, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print("Done! seo_desc field added to products.json")

if __name__ == '__main__':
    main()
