import urllib.request
import urllib.error
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Test if R2 image URLs are publicly accessible
test_urls = [
    'https://pub-1fd965ab66464286847edcb540254451.r2.dev/605040/605040-4.jpg',
    'https://pub-1fd965ab66464286847edcb540254451.r2.dev/605041/605041-1.jpg',
]

print("Testing R2 image URL accessibility...")
for url in test_urls:
    try:
        req = urllib.request.Request(url, method='HEAD')
        with urllib.request.urlopen(req, timeout=10) as r:
            print(f"  OK: {url[:80]}... status={r.status}")
            print(f"     Content-Type: {r.headers.get('Content-Type')}")
            print(f"     Content-Length: {r.headers.get('Content-Length')}")
    except urllib.error.HTTPError as e:
        print(f"  HTTP Error {e.code}: {url[:80]}...")
    except Exception as e:
        print(f"  Error: {e} - {url[:80]}...")

# Also test products-public.json via .pages.dev
print("\nTesting products-public.json access...")
try:
    req = urllib.request.Request('https://party-maker-website.pages.dev/products-public.json')
    with urllib.request.urlopen(req, timeout=10) as r:
        print(f"  OK: status={r.status}")
        print(f"     Content-Type: {r.headers.get('Content-Type')}")
except Exception as e:
    print(f"  Error: {e}")
