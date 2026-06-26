"""
Import Diwali products: Feishu Base → R2 images → products.json → build_pages.py
Non-interactive, fully automated.
"""
import json, os, sys, subprocess, time, io
from pathlib import Path

# ===================== CONFIG =====================
WEBSITE_DIR = Path(__file__).parent
PRODUCTS_JSON = WEBSITE_DIR / "products.json"
RAW_JSON = WEBSITE_DIR / ".diwali_raw.json"
TEMP_IMG_DIR = WEBSITE_DIR / ".diwali_imgs"
BASE_TOKEN = "L8CJbRxEoa2neRsvqvycAMjsnxg"
TABLE_ID = "tblkHyLWTAWl4yPH"
R2_PUBLIC = "https://pub-1fd965ab66464286847edcb540254451.r2.dev"

LARK_CLI = r"C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2\lark-cli"

# ===================== HELPERS =====================

def lark(*args):
    """Run lark-cli with common args, return subprocess result."""
    return subprocess.run(
        ["bash", LARK_CLI, *args, "--as", "bot"],
        capture_output=True, text=True, timeout=30,
        env={**os.environ, "LARK_CLI_NO_PROXY": "1"}
    )

def read_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def write_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def seo_desc(p):
    """Generate SEO description from product fields."""
    parts = [f"{p['name']} is a Diwali {p['subcategory']} product, factory-direct wholesale from Yiwu, China."]
    if p['description']:
        parts.append(f"Specs: {p['description']}.")
    try:
        pf = p['price']
        if pf > 0:
            rl, rh = round(pf*2.8,2), round(pf*3.5,2)
            m = round((rh-pf)/rh*100)
            parts.append(f"Wholesale ${pf}/unit; suggested retail ${rl}–${rh}, ~{m}% margin.")
            pct = p.get('_pcsPerCtn', 0)
            cbm = p.get('_cbm', 0)
            if pct and pct > 0:
                parts.append(f"Ships {int(pct)} pcs/carton (value ${int(pct)*pf:,.0f}).")
                if cbm and cbm > 0:
                    parts.append(f"~{int(int(pct)/cbm)} units per CBM.")
    except: pass
    if 'hot' in p.get('tags', []):
        parts.append("Hot seller based on 2026 buyer activity.")
    parts.append("No MOQ for spot goods. Custom 600+ pcs with private labeling. Global shipping. Contact info@partymaker.cn.")
    return " ".join(parts)

# ===================== STEP 1: PARSE =====================

def parse():
    raw = read_json(RAW_JSON)
    records = raw['data']['data']
    record_ids = raw['data']['record_id_list']
    products = []
    for i, rec in enumerate(records):
        sku = str(rec[0]).strip() if rec[0] else None
        if not sku: continue
        fn = (rec[3] or [])
        subcat = fn[0].strip() if fn else "Other"
        tags = [t.lower() for t in (rec[15] or []) if str(t).lower() == 'hot']
        p = {
            "id": sku, "sku": sku,
            "name": rec[20] or "",
            "price": float(rec[11]) if rec[11] else 0,
            "description": str(rec[2]) if rec[2] else "",
            "seo_desc": "",  # filled below
            "theme": "Diwali",
            "subcategory": subcat,
            "images": [],
            "tags": tags,
            "_costPrice": float(rec[4]) if rec[4] else 0,
            "_costNote": str(rec[12]) if rec[12] else "",
            "_orderNo": str(rec[5]) if rec[5] else "",
            "_stockQty": str(rec[10]) if rec[10] else "0",
            "_unitSize": str(rec[21]) if rec[21] else "",
            "_ctnL": float(rec[13]) if rec[13] else 0,
            "_ctnW": float(rec[28]) if len(rec) > 28 and rec[28] else 0,
            "_ctnH": float(rec[16]) if rec[16] else 0,
            "_pcsPerCtn": int(rec[8]) if rec[8] else 0,
            "_cbm": float(rec[22]) if rec[22] else 0,
            "_nw": float(rec[18]) if rec[18] else 0,
            "_gw": float(rec[1]) if rec[1] else 0,
            "_record_id": record_ids[i] if i < len(record_ids) else "",
            "_feishu_images": rec[26] or [],
        }
        p['seo_desc'] = seo_desc(p)
        products.append(p)
    return products

# ===================== STEP 2: DOWNLOAD IMAGES =====================

def download_images(products):
    TEMP_IMG_DIR.mkdir(parents=True, exist_ok=True)
    total = sum(len(p['_feishu_images']) for p in products)
    done, skipped = 0, 0

    for p in products:
        imgs = p.get('_feishu_images', [])
        if not imgs: continue
        sku_dir = TEMP_IMG_DIR / p['sku']
        sku_dir.mkdir(parents=True, exist_ok=True)
        local = []
        for i, img in enumerate(imgs):
            ft = img.get('file_token', '')
            if not ft: continue
            ext = os.path.splitext(img.get('name', '.jpg'))[1].lower()
            if ext not in ('.jpg','.jpeg','.png','.webp'): ext = '.jpg'
            op = sku_dir / f"{i+1:02d}{ext}"
            if op.exists() and op.stat().st_size > 100:
                local.append(str(op)); skipped += 1; continue
            print(f"  [{done+skipped+1}/{total}] DL {p['sku']}/{i+1:02d}")
            r = lark("base", "+record-download-attachment",
                     "--base-token", BASE_TOKEN, "--table-id", TABLE_ID,
                     "--record-id", p['_record_id'],
                     "--file-token", ft, "--output", str(op))
            if r.returncode == 0 and op.exists() and op.stat().st_size > 100:
                local.append(str(op)); done += 1
            else:
                print(f"    FAIL: {r.stderr[:150] if r.stderr else 'unknown'}")
            time.sleep(0.2)
        p['_local_imgs'] = local
    print(f"  Downloaded {done}, cached {skipped}, total {total}")

# ===================== STEP 3: UPLOAD TO R2 =====================

def upload_r2(products):
    import boto3; from botocore.config import Config; from PIL import Image
    r2 = boto3.client('s3', endpoint_url="https://cdd100719805df54e62bee48d165b2dd.r2.cloudflarestorage.com",
                      aws_access_key_id="6ba9614989d68d1b8f7f7d6b53f50e54",
                      aws_secret_access_key="10d4b41750b6965866db2bac4f33c8d6be56679219efe4cab6ae0211eacd6d80",
                      region_name='auto', config=Config(signature_version='s3v4'))
    total = sum(len(p.get('_local_imgs',[])) for p in products)
    up = 0
    for p in products:
        urls = []
        for i, lp in enumerate(p.get('_local_imgs', [])):
            key = f"{p['sku']}/{i+1:02d}.webp"
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
                print(f"  [{up}/{total}] {key} ({len(buf.getvalue())//1024}KB)")
            except Exception as e:
                print(f"  FAIL {key}: {e}")
            time.sleep(0.05)
        p['images'] = urls
        p.pop('_local_imgs', None)
        p.pop('_feishu_images', None)
        p.pop('_record_id', None)
    print(f"  Uploaded {up}/{total} to R2")

# ===================== STEP 4: WRITE + BUILD =====================

def append_and_build(products):
    existing = read_json(PRODUCTS_JSON)
    existing_skus = {p['sku'] for p in existing['products']}
    new = 0
    for p in products:
        if p['sku'] not in existing_skus:
            existing['products'].append(p)
            existing_skus.add(p['sku']); new += 1
    write_json(PRODUCTS_JSON, existing)
    print(f"  Added {new} products → products.json (total {len(existing['products'])})")

    print(f"\n  Running build_pages.py...")
    r = subprocess.run([sys.executable, str(WEBSITE_DIR/"build_pages.py")],
                       capture_output=True, text=True, cwd=str(WEBSITE_DIR), timeout=600)
    if r.stdout: print(r.stdout[-2000:])
    if r.stderr: print("STDERR:", r.stderr[:300])
    return new

# ===================== MAIN =====================

def main():
    print("="*50)
    print("Diwali Import Pipeline")
    print("="*50)

    print("\n[1/5] Parse Feishu data...")
    products = parse()
    print(f"  {len(products)} products")
    for p in products:
        tag = " HOT" if 'hot' in p['tags'] else ""
        n = len(p.get('_feishu_images',[]))
        print(f"  {p['sku']} | ${p['price']:.2f} | {p['subcategory']:20s} | {n} imgs{tag}")

    print(f"\n[2/5] Download images from Feishu...")
    download_images(products)

    print(f"\n[3/5] Upload to R2...")
    upload_r2(products)

    print(f"\n[4/5] Write products.json + build...")
    append_and_build(products)

    print(f"\n[5/5] Done!")
    print(f"  /diwali/ — theme page")
    print(f"  /diwali/<subcat>/ — subcategory pages")
    print(f"  product/<SKU>/ — product pages")
    print("="*50)

if __name__ == '__main__':
    main()
