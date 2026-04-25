import urllib.request
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

# Try fetching from the .pages.dev domain
url = 'https://party-maker-website.pages.dev/products-public.json'
print(f"Fetching {url} ...")
try:
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    products = data['products']
    print(f"SUCCESS! Total products: {len(products)}")
    has_images = sum(1 for p in products if p.get('images') and len(p['images']) > 0)
    no_images = len(products) - has_images
    print(f"Has images: {has_images}")
    print(f"No images: {no_images}")
except Exception as e:
    print(f"FAILED: {e}")
    
    # Try www domain
    url2 = 'https://www.partymaker.cn/products-public.json'
    print(f"\nTrying {url2} ...")
    try:
        req2 = urllib.request.Request(url2, headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req2, timeout=15) as r:
            data = json.loads(r.read())
        products = data['products']
        print(f"SUCCESS! Total products: {len(products)}")
        has_images = sum(1 for p in products if p.get('images') and len(p['images']) > 0)
        no_images = len(products) - has_images
        print(f"Has images: {has_images}")
        print(f"No images: {no_images}")
    except Exception as e2:
        print(f"FAILED: {e2}")
