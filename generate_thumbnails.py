#!/usr/bin/env python3
"""
generate_thumbnails.py — Generate thumbnails for existing R2 images
Downloads each image from R2, creates a 300px thumbnail, uploads back to R2 as {SKU}/thumb/{NN}.webp
Run: python generate_thumbnails.py [--dry-run]
"""

import io
import json
import sys
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from PIL import Image

# R2 Credentials
R2_ENDPOINT = "https://cdd100719805df54e62bee48d165b2dd.r2.cloudflarestorage.com"
R2_ACCESS_KEY = "6ba9614989d68d1b8f7f7d6b53f50e54"
R2_SECRET_KEY = "10d4b41750b6965866db2bac4f33c8d6be56679219efe4cab6ae0211eacd6d80"
BUCKET_NAME = "party-maker"
R2_PUBLIC = "https://pub-1fd965ab66464286847edcb540254451.r2.dev"

# Thumbnail settings
THUMB_MAX_SIZE = 300
THUMB_QUALITY = 75

def get_r2_client():
    return boto3.client(
        's3',
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        region_name='auto',
        config=Config(signature_version='s3v4')
    )

def main():
    dry_run = '--dry-run' in sys.argv

    # Load products.json to get SKU list and image URLs
    from pathlib import Path
    products_file = Path(__file__).parent / 'products.json'
    with open(products_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    products = data.get('products', data)

    client = get_r2_client()

    # Test connection
    try:
        client.head_bucket(Bucket=BUCKET_NAME)
        print(f"Connected to R2 bucket: {BUCKET_NAME}")
    except ClientError as e:
        print(f"R2 connection failed: {e}")
        return

    # Collect all image keys from R2 (to check which thumbnails already exist)
    existing_thumbs = set()
    if not dry_run:
        print("Scanning R2 for existing thumbnails...")
        paginator = client.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix='', Delimiter=''):
            for obj in page.get('Contents', []):
                if '/thumb/' in obj['Key']:
                    existing_thumbs.add(obj['Key'])

    print(f"Found {len(existing_thumbs)} existing thumbnails on R2")

    total = 0
    generated = 0
    skipped = 0
    failed = 0

    for p in products:
        images = p.get('images', [])
        if not images:
            continue

        for img_url in images:
            # Parse R2 key from URL: https://pub-xxx.r2.dev/{SKU}/{NN}.webp
            if R2_PUBLIC in img_url:
                r2_key = img_url.replace(R2_PUBLIC + '/', '')
            else:
                continue

            # Build thumbnail key: {SKU}/thumb/{NN}.webp
            parts = r2_key.rsplit('/', 1)
            if len(parts) != 2:
                continue
            sku_dir, filename = parts
            thumb_key = f"{sku_dir}/thumb/{filename}"

            total += 1

            if thumb_key in existing_thumbs:
                skipped += 1
                continue

            if dry_run:
                print(f"  [DRY] Would generate: {thumb_key}")
                generated += 1
                continue

            # Download image from R2
            try:
                resp = client.get_object(Bucket=BUCKET_NAME, Key=r2_key)
                img_data = resp['Body'].read()
                img = Image.open(io.BytesIO(img_data))

                # Create thumbnail
                img.thumbnail((THUMB_MAX_SIZE, THUMB_MAX_SIZE), Image.LANCZOS)
                thumb_buf = io.BytesIO()
                if img.mode in ('RGBA', 'LA', 'P'):
                    img = img.convert('RGB')
                img.save(thumb_buf, format='WEBP', quality=THUMB_QUALITY, optimize=True)
                thumb_buf.seek(0)

                # Upload thumbnail
                client.upload_fileobj(thumb_buf, BUCKET_NAME, thumb_key,
                                      ExtraArgs={'ContentType': 'image/webp'})
                generated += 1

                if generated <= 10 or generated % 100 == 0:
                    print(f"  [{generated}] {thumb_key} ({len(img_data)//1024}KB -> {thumb_buf.tell()//1024}KB)")

            except Exception as e:
                failed += 1
                if failed <= 5:
                    print(f"  [FAIL] {r2_key}: {e}")

    print(f"\n=== Done ===")
    print(f"Total images: {total}")
    print(f"Generated: {generated}")
    print(f"Skipped (already exist): {skipped}")
    print(f"Failed: {failed}")

if __name__ == '__main__':
    main()
