#!/usr/bin/env python3
"""
Generate thumbnails for products.
- Run standalone: scans products.json, generates missing thumbnails for all
- Imported: call generate_thumbs(products, [skus_filter]) to generate for specific products
"""
import io, json, sys
import boto3
from botocore.config import Config
from PIL import Image

R2_ENDPOINT = "https://cdd100719805df54e62bee48d165b2dd.r2.cloudflarestorage.com"
R2_ACCESS_KEY = "6ba9614989d68d1b8f7f7d6b53f50e54"
R2_SECRET_KEY = "10d4b41750b6965866db2bac4f33c8d6be56679219efe4cab6ae0211eacd6d80"
BUCKET_NAME = "party-maker"
R2_PUBLIC = "https://pub-1fd965ab66464286847edcb540254451.r2.dev"
THUMB_MAX_SIZE = 300
THUMB_QUALITY = 75


def _get_client():
    return boto3.client('s3', endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY, aws_secret_access_key=R2_SECRET_KEY,
        region_name='auto', config=Config(signature_version='s3v4', max_pool_connections=25))


def generate_thumbs(client, products, verbose=True):
    """
    Generate thumbnails for given products.
    Skips products without images, and skips thumbnails that already exist on R2.
    """
    to_generate = []
    for p in products:
        for img_url in p.get('images', []):
            if R2_PUBLIC not in img_url:
                continue
            r2_key = img_url.replace(R2_PUBLIC + '/', '')
            parts = r2_key.rsplit('/', 1)
            if len(parts) != 2:
                continue
            thumb_key = f"{parts[0]}/thumb/{parts[1]}"

            # Check if thumb already exists (HEAD request)
            try:
                client.head_object(Bucket=BUCKET_NAME, Key=thumb_key)
                continue  # already exists
            except:
                pass

            to_generate.append((r2_key, thumb_key, p.get('sku', '?')))

    if not to_generate:
        if verbose:
            print("  All thumbnails already exist!", flush=True)
        return {'generated': 0, 'failed': 0, 'skipped': 0, 'total': 0}

    if verbose:
        print(f"  Generating {len(to_generate)} thumbnails...", flush=True)

    generated = 0
    failed = 0
    for r2_key, thumb_key, sku in to_generate:
        try:
            resp = client.get_object(Bucket=BUCKET_NAME, Key=r2_key)
            img_data = resp['Body'].read()
            img = Image.open(io.BytesIO(img_data))
            img.thumbnail((THUMB_MAX_SIZE, THUMB_MAX_SIZE), Image.LANCZOS)
            if img.mode in ('RGBA', 'LA', 'P'):
                img = img.convert('RGB')
            thumb_buf = io.BytesIO()
            img.save(thumb_buf, format='WEBP', quality=THUMB_QUALITY, optimize=True)
            thumb_buf.seek(0)
            client.upload_fileobj(thumb_buf, BUCKET_NAME, thumb_key,
                                  ExtraArgs={'ContentType': 'image/webp'})
            generated += 1
            if verbose and generated % 20 == 0:
                print(f"    [{generated}/{len(to_generate)}] done...", flush=True)
        except Exception as e:
            failed += 1
            if verbose and failed <= 3:
                print(f"    [FAIL] {sku} {r2_key}: {e}", flush=True)

    result = {'generated': generated, 'failed': failed, 'skipped': len(to_generate) - generated - failed, 'total': len(to_generate)}
    if verbose:
        print(f"  Done: {generated} generated, {failed} failed", flush=True)
    return result


# ================ Standalone ================
if __name__ == '__main__':
    print("Scanning R2 for existing thumbs...", flush=True)
    client = _get_client()
    has_thumb = set()
    paginator = client.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=BUCKET_NAME):
        for obj in page.get('Contents', []):
            if '/thumb/' in obj['Key']:
                has_thumb.add(obj['Key'])
    print(f"Found {len(has_thumb)} existing thumbnails", flush=True)

    with open('products.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    products = data if isinstance(data, list) else data.get('products', data.get('data', []))

    # Filter to only products whose thumbs aren't already in has_thumb
    to_generate = []
    for p in products:
        for img_url in p.get('images', []):
            if R2_PUBLIC not in img_url:
                continue
            r2_key = img_url.replace(R2_PUBLIC + '/', '')
            parts = r2_key.rsplit('/', 1)
            if len(parts) != 2:
                continue
            thumb_key = f"{parts[0]}/thumb/{parts[1]}"
            if thumb_key not in has_thumb:
                to_generate.append((r2_key, thumb_key, p.get('sku', '?')))

    if not to_generate:
        print("All thumbnails already exist!")
        sys.exit(0)

    print(f"Need to generate: {len(to_generate)} thumbnails", flush=True)

    generated = 0
    failed = 0
    for r2_key, thumb_key, sku in to_generate:
        try:
            resp = client.get_object(Bucket=BUCKET_NAME, Key=r2_key)
            img_data = resp['Body'].read()
            img = Image.open(io.BytesIO(img_data))
            img.thumbnail((THUMB_MAX_SIZE, THUMB_MAX_SIZE), Image.LANCZOS)
            if img.mode in ('RGBA', 'LA', 'P'):
                img = img.convert('RGB')
            thumb_buf = io.BytesIO()
            img.save(thumb_buf, format='WEBP', quality=THUMB_QUALITY, optimize=True)
            thumb_buf.seek(0)
            client.upload_fileobj(thumb_buf, BUCKET_NAME, thumb_key,
                                  ExtraArgs={'ContentType': 'image/webp'})
            generated += 1
            if generated % 50 == 0:
                print(f"  [{generated}/{len(to_generate)}] done...", flush=True)
        except Exception as e:
            failed += 1
            if failed <= 5:
                print(f"  [FAIL] {r2_key}: {e}", flush=True)

    print(f"\nDone: {generated} generated, {failed} failed, {len(to_generate)} total", flush=True)
