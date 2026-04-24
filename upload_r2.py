"""
Party Maker - R2 Image Uploader
Upload local images to Cloudflare R2, matched by SKU from Excel
Converts all images to WebP format for reduced file size before upload.
"""
import os
import sys
import io
from pathlib import Path
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from PIL import Image

# WebP quality (85 = good balance of quality/size)
WEBP_QUALITY = 85

# R2 Credentials
R2_ENDPOINT = "https://cdd100719805df54e62bee48d165b2dd.r2.cloudflarestorage.com"
R2_ACCESS_KEY = "6ba9614989d68d1b8f7f7d6b53f50e54"
R2_SECRET_KEY = "10d4b41750b6965866db2bac4f33c8d6be56679219efe4cab6ae0211eacd6d80"
BUCKET_NAME = "party-maker"
REGION = "auto"

# Paths
IMAGE_FOLDER = r"D:\upload"
WEBSITE_DIR = Path(__file__).parent

def get_r2_client():
    return boto3.client(
        's3',
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        region_name=REGION,
        config=Config(signature_version='s3v4')
    )

def convert_to_webp(local_path):
    """Convert image to WebP format. Returns bytes buffer or None on error."""
    try:
        img = Image.open(local_path)
        # Convert RGBA to RGB if needed (WebP doesn't support RGBA in some viewers)
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGB')
        buf = io.BytesIO()
        img.save(buf, format='WEBP', quality=WEBP_QUALITY, optimize=True)
        buf.seek(0)
        return buf
    except Exception as e:
        print(f"  WebP conversion failed for {local_path}: {e}")
        return None

def extract_sku_from_filename(filename):
    """Extract SKU from filename like '605040-4.jpg' or '605040(4).jpg' -> '605040'"""
    name = os.path.splitext(filename)[0]
    # Try dash format first
    if '-' in name:
        return name.split('-')[0]
    # Try parenthesis format
    if '(' in name:
        return name.split('(')[0]
    # Try to extract numeric prefix
    match = ''
    for c in name:
        if c.isdigit():
            match += c
        else:
            break
    return match

def find_matching_images(sku, all_files):
    """Find all images matching a SKU"""
    matches = []
    sku_str = str(sku).strip()
    for f in all_files:
        f_sku = extract_sku_from_filename(f)
        if f_sku == sku_str:
            matches.append(f)
    return sorted(matches)

def upload_single(client, local_path, r2_key):
    """Upload single file to R2. Converts to WebP before upload."""
    try:
        # Convert to WebP
        webp_buf = convert_to_webp(local_path)
        if webp_buf is None:
            return False
        # Update r2_key to use .webp extension
        webp_key = r2_key.rsplit('.', 1)[0] + '.webp'
        client.upload_fileobj(webp_buf, BUCKET_NAME, webp_key,
                              ExtraArgs={'ContentType': 'image/webp'})
        return True
    except ClientError as e:
        print(f"  ERROR uploading {local_path}: {e}")
        return False

def upload_images_for_skus(excel_path, image_folder):
    """Main: Read Excel, match images, upload to R2"""
    import pandas as pd

    # Read Excel
    df = pd.read_excel(excel_path, sheet_name='产品总表')
    print(f"Loaded {len(df)} products from Excel")

    # Get all image files
    all_files = [f for f in os.listdir(image_folder)
                 if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))]
    print(f"Found {len(all_files)} images in {image_folder}")

    # Connect to R2
    client = get_r2_client()

    # Test connection
    try:
        client.head_bucket(Bucket=BUCKET_NAME)
        print(f"Connected to R2 bucket: {BUCKET_NAME}")
    except ClientError as e:
        print(f"R2 connection failed: {e}")
        return

    # Process each product
    uploaded = 0
    skipped = 0
    not_found = 0
    total_uploaded_images = 0

    for _, row in df.iterrows():
        sku = str(row.get('Item No.', '')).strip()
        if not sku or sku == 'nan':
            continue

        matches = find_matching_images(sku, all_files)
        r2_urls = []

        for i, img_file in enumerate(matches):
            local_path = os.path.join(image_folder, img_file)
            r2_key = f"{sku}/{i+1:02d}{os.path.splitext(img_file)[1].lower()}"

            if upload_single(client, local_path, r2_key):
                # Generate public URL
                r2_url = f"{R2_ENDPOINT}/{BUCKET_NAME}/{r2_key}"
                r2_urls.append(r2_url)
                total_uploaded_images += 1

        if r2_urls:
            uploaded += 1
            print(f"  [{uploaded}] SKU {sku}: {len(r2_urls)} images -> {r2_urls[0]}")
        elif matches:
            skipped += 1
            print(f"  [SKIP] SKU {sku}: {len(matches)} matched but upload failed")
        else:
            not_found += 1
            if not_found <= 10:
                print(f"  [NOT FOUND] SKU {sku}: no matching images")

    print(f"\n=== Done ===")
    print(f"Products with images: {uploaded}")
    print(f"Products skipped: {skipped}")
    print(f"Products not found: {not_found}")
    print(f"Total images uploaded: {total_uploaded_images}")

    # Generate products JSON
    generate_products_json(df, client)

def generate_products_json(df, r2_client):
    """Generate products.json with R2 image URLs"""
    import json

    products = []
    all_files = os.listdir(IMAGE_FOLDER)

    for _, row in df.iterrows():
        sku = str(row.get('Item No.', '')).strip()
        if not sku or sku == 'nan':
            continue

        # Find R2 images
        matches = find_matching_images(sku, all_files)
        r2_urls = [f"{R2_ENDPOINT}/{BUCKET_NAME}/{sku}/{i+1:02d}.webp"
                   for i, m in enumerate(sorted(matches))]

        # Parse price - remove $ sign
        price_str = str(row.get('USD Price', '0')).replace('$', '').replace(',', '').strip()
        try:
            price = float(price_str)
        except:
            price = 0.0

        theme = str(row.get('Theme', 'General')).strip()
        func = str(row.get('Function', 'Decoration')).strip()

        # Tags字段（支持hot/new标签）
        tags_str = str(row.get('Tags', '')).strip()
        tags = [t.strip().lower() for t in tags_str.split(',') if t.strip()] if tags_str else []

        product = {
            "id": sku,
            "sku": sku,
            "name": str(row.get('Product Name', '')).strip(),
            "price": price,
            "theme": theme if theme != 'nan' else 'General',
            "subcategory": func if func != 'nan' else 'Decoration',
            "description": str(row.get('Description', '')).strip(),
            "images": r2_urls if r2_urls else [],
            "tags": tags,  # ← 新增tags字段
            # Additional fields for PI email
            "_costPrice": float(row.get('成本价', 0) or 0),
            "_unitSize": str(row.get('Unit Size', '') or ''),
            "_ctnL": row.get('CTN L', 0) or 0,
            "_ctnW": row.get('CTN W', 0) or 0,
            "_ctnH": row.get('CTN H', 0) or 0,
            "_pcsPerCtn": row.get('pcs/CTN', 0) or 0,
            "_cbm": row.get('CBM', 0) or 0,
            "_nw": row.get('N.W', 0) or 0,
            "_gw": row.get('G.W', 0) or 0,
        }
        products.append(product)

    output = {
        "products": products,
        "themes": sorted(list(set(p['theme'] for p in products))),
        "categories": {}
    }

    for p in products:
        theme = p['theme']
        sub = p['subcategory']
        if theme not in output['categories']:
            output['categories'][theme] = {}
        if sub not in output['categories'][theme]:
            output['categories'][theme][sub] = []

    for p in products:
        output['categories'][p['theme']][p['subcategory']].append(p['id'])

    with open(WEBSITE_DIR / 'products.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nGenerated products.json with {len(products)} products")
    print("Saved to: party-maker-website/products.json")

if __name__ == '__main__':
    excel_path = WEBSITE_DIR.parent / "产品数据上传模板_v2.xlsx"

    if not os.path.exists(IMAGE_FOLDER):
        print(f"ERROR: Image folder not found: {IMAGE_FOLDER}")
        print("Please check the path and try again.")
    else:
        upload_images_for_skus(excel_path, IMAGE_FOLDER)
