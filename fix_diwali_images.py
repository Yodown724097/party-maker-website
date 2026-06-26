"""
Fix Diwali images: re-download with correct record_ids, upload to R2, update products.json
"""
import json, os, sys, subprocess, time, io
from pathlib import Path

WEBSITE_DIR = Path(__file__).parent
RAW_JSON = WEBSITE_DIR / ".diwali_raw.json"
TEMP_IMG_DIR = WEBSITE_DIR / ".diwali_imgs"
PRODUCTS_JSON = WEBSITE_DIR / "products.json"
BASE_TOKEN = "L8CJbRxEoa2neRsvqvycAMjsnxg"
TABLE_ID = "tblkHyLWTAWl4yPH"
R2_PUBLIC = "https://pub-1fd965ab66464286847edcb540254451.r2.dev"

LARK_CLI = r"C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2\lark-cli"

def lark(*args):
    return subprocess.run(
        ["bash", LARK_CLI, *args, "--as", "bot"],
        capture_output=True, text=True, timeout=30,
        env={**os.environ, "LARK_CLI_NO_PROXY": "1"}
    )

print("Loading raw Feishu data...")
raw = json.load(open(RAW_JSON, encoding='utf-8'))
records = raw['data']['data']
record_ids = raw['data']['record_id_list']

# Build SKU -> (record_id, images) map
sku_map = {}
for i, rec in enumerate(records):
    sku = str(rec[0]).strip() if rec[0] else None
    if not sku: continue
    rid = record_ids[i]
    imgs = rec[26] or []
    sku_map[sku] = (rid, imgs)

print(f"Found {len(sku_map)} products with images")

# Download images
TEMP_IMG_DIR.mkdir(parents=True, exist_ok=True)
total = sum(len(v[1]) for v in sku_map.values())
done = 0
sku_images = {}  # sku -> [local_paths]

for sku, (rid, imgs) in sku_map.items():
    if not imgs:
        sku_images[sku] = []
        continue
    sku_dir = TEMP_IMG_DIR / sku
    sku_dir.mkdir(parents=True, exist_ok=True)
    local = []
    for i, img in enumerate(imgs):
        ft = img.get('file_token', '')
        if not ft: continue
        ext = os.path.splitext(img.get('name', '.jpg'))[1].lower()
        if ext not in ('.jpg','.jpeg','.png','.webp'): ext = '.jpg'
        op = sku_dir / f"{i+1:02d}{ext}"
        if op.exists() and op.stat().st_size > 100:
            local.append(str(op)); continue
        print(f"  [{len(local)+1}/{total}] DL {sku}/{i+1:02d}  rid={rid}")
        r = subprocess.run(
            ["bash", LARK_CLI, "base", "+record-download-attachment",
             "--base-token", BASE_TOKEN, "--table-id", TABLE_ID,
             "--record-id", rid, "--file-token", ft,
             "--output", str(op.name), "--as", "bot"],
            capture_output=True, text=True, timeout=30,
            cwd=str(sku_dir),
            env={**os.environ, "LARK_CLI_NO_PROXY": "1"}
        )
        if r.returncode == 0 and op.exists() and op.stat().st_size > 100:
            local.append(str(op))
        else:
            print(f"    FAIL: {r.stderr[:200] if r.stderr else 'unknown'}")
        time.sleep(0.2)
    sku_images[sku] = local

dl_count = sum(len(v) for v in sku_images.values())
print(f"Downloaded {dl_count}/{total} images")

# Upload to R2
print("Uploading to R2...")
import boto3; from botocore.config import Config; from PIL import Image
r2 = boto3.client('s3', endpoint_url="https://cdd100719805df54e62bee48d165b2dd.r2.cloudflarestorage.com",
                  aws_access_key_id="6ba9614989d68d1b8f7f7d6b53f50e54",
                  aws_secret_access_key="10d4b41750b6965866db2bac4f33c8d6be56679219efe4cab6ae0211eacd6d80",
                  region_name='auto', config=Config(signature_version='s3v4'))

up = 0
r2_urls = {}  # sku -> [r2 urls]
for sku, local_paths in sku_images.items():
    urls = []
    for i, lp in enumerate(local_paths):
        key = f"{sku}/{i+1:02d}.webp"
        try:
            img = Image.open(lp)
            if img.mode in ('RGBA','LA','P'): img = img.convert('RGB')
            buf = io.BytesIO()
            img.save(buf, format='WEBP', quality=85, optimize=True)
            buf.seek(0)
            r2.upload_fileobj(buf, "party-maker", key,
                              ExtraArgs={'ContentType':'image/webp','ACL':'public-read'})
            urls.append(f"{R2_PUBLIC}/{key}")
            up += 1
            print(f"  [{up}/{dl_count}] {key} ({len(buf.getvalue())//1024}KB)")
        except Exception as e:
            print(f"  FAIL {key}: {e}")
        time.sleep(0.05)
    r2_urls[sku] = urls

print(f"Uploaded {up}/{dl_count} to R2")

# Update products.json
print("Updating products.json...")
data = json.load(open(PRODUCTS_JSON, encoding='utf-8'))
updated = 0
for p in data['products']:
    if p['theme'] == 'Diwali' and p['sku'] in r2_urls:
        p['images'] = r2_urls[p['sku']]
        updated += 1
json.dump(data, open(PRODUCTS_JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(f"Updated {updated} products")

# Rebuild
print("Rebuilding pages...")
r = subprocess.run([sys.executable, str(WEBSITE_DIR/"build_pages.py")],
                   capture_output=True, text=True, cwd=str(WEBSITE_DIR), timeout=600)
print(r.stdout[-1500:] if r.stdout else "")
if r.stderr: print("STDERR:", r.stderr[:300])

print("DONE!")
