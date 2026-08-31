# -*- coding: utf-8 -*-
"""
修复 36 个补图表有图但 products.json 缺失的产品图片。
复用 fix_diwali_images.py 的方法: 飞书补图表 → 下载 → 传R2 → 更新products.json → rebuild
只处理补图表(tblQ8HGCGQQ4BLBY)中确实有 Image 附件的无图SKU。幂等。
"""
import json, os, sys, subprocess, time, io, glob
from pathlib import Path

WEBSITE_DIR = Path(__file__).parent
PRODUCTS_JSON = WEBSITE_DIR / "products.json"
TEMP_IMG_DIR = WEBSITE_DIR / ".fiximgs"
BASE_TOKEN = "CetVbrjCDaOXOysj68EcaGFrnfg"
TABLE_ID = "tblQ8HGCGQQ4BLBY"
R2_PUBLIC = "https://pub-1fd965ab66464286847edcb540254451.r2.dev"
LARK_CLI = r"C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2\lark-cli"

# 需要修复的无图 SKU (补图表中确认有图的 36 个)
TARGET_SKUS = ['608301','608302','613291','614034','614105','614106','614107','615133',
'616226','616227','617074','623261','623262','623263','624169','625504','625505','625517',
'631736','631737','641289','641290','641291','641391-取消','642078','642079','651073','651074',
'902148','ZY-02','ZY-03','ZY-05','ZY-06','ZY-07','ZY-08','ZY-1']

def lark(*args, cwd=None):
    return subprocess.run(
        ["bash", LARK_CLI, *args, "--as", "bot"],
        capture_output=True, text=True, timeout=30, cwd=cwd,
        env={**os.environ, "LARK_CLI_NO_PROXY": "1"}
    )

# ---- 1. 从补图表建立 sku -> (record_id, image_tokens) ----
print("Loading product library records...")
sku_info = {}  # sku -> {'record_id':..., 'images':[{file_token,name}]}
for fp in glob.glob(str(WEBSITE_DIR / ".prodlib_*.ndjson")):
    for line in open(fp, encoding='utf-8'):
        line = line.strip()
        if not line: continue
        try:
            o = json.loads(line)
            sku = str(o.get('Item No.') or '').strip()
            imgs = o.get('Image') or []
            if sku and imgs and sku not in sku_info:
                sku_info[sku] = {'record_id': o.get('record_id'), 'images': imgs}
        except: pass

print(f"补图表有图SKU数: {len(sku_info)}")
repairable = [s for s in TARGET_SKUS if s in sku_info]
print(f"目标36个中, 补图表确认有图的: {len(repairable)}")
print("可修复:", repairable)

# ---- 2. 下载图片 ----
TEMP_IMG_DIR.mkdir(parents=True, exist_ok=True)
sku_local = {}  # sku -> [local paths]
total = sum(len(sku_info[s]['images']) for s in repairable)
done = 0
for sku in repairable:
    info = sku_info[sku]
    rid = info['record_id']
    sku_dir = TEMP_IMG_DIR / (sku.replace('/','_').replace('\\','_'))
    sku_dir.mkdir(parents=True, exist_ok=True)
    local = []
    for i, img in enumerate(info['images']):
        ft = img.get('file_token', '')
        if not ft: continue
        ext = os.path.splitext(img.get('name','.jpg'))[1].lower()
        if ext not in ('.jpg','.jpeg','.png','.webp'): ext = '.jpg'
        op = sku_dir / f"{i+1:02d}{ext}"
        if op.exists() and op.stat().st_size > 100:
            local.append(str(op)); done += 1; continue
        r = lark("base","+record-download-attachment",
                 "--base-token",BASE_TOKEN,"--table-id",TABLE_ID,
                 "--record-id",rid,"--file-token",ft,"--output",str(op.name), cwd=str(sku_dir))
        if r.returncode == 0 and op.exists() and op.stat().st_size > 100:
            local.append(str(op)); done += 1
            print(f"  [{done}/{total}] DL {sku}/{i+1}")
        else:
            print(f"  FAIL {sku}/{i+1}: {r.stderr[:120] if r.stderr else ''}")
        time.sleep(0.15)
    if local:
        sku_local[sku] = local
    else:
        print(f"  !! {sku}: 没有成功下载任何图片, 跳过")
print(f"下载完成: {done}/{total}")

# ---- 3. 上传 R2 ----
sys.path.insert(0, str(WEBSITE_DIR))
from PIL import Image
import boto3
from botocore.config import Config

r2 = boto3.client('s3', endpoint_url="https://cdd100719805df54e62bee48d165b2dd.r2.cloudflarestorage.com",
                  aws_access_key_id="6ba9614989d68d1b8f7f7d6b53f50e54",
                  aws_secret_access_key="10d4b41750b6965866db2bac4f33c8d6be56679219efe4cab6ae0211eacd6d80",
                  region_name='auto', config=Config(signature_version='s3v4'))

sku_uploaded = {}  # sku -> [r2 urls]
up = 0
for sku, paths in sku_local.items():
    urls = []
    for i, lp in enumerate(paths):
        key = f"{sku}/{i+1:02d}.webp"
        try:
            img = Image.open(lp)
            if img.mode in ('RGBA','LA','P'): img = img.convert('RGB')
            buf = io.BytesIO(); img.save(buf, format='WEBP', quality=85, optimize=True); buf.seek(0)
            r2.upload_fileobj(buf, "party-maker", key,
                              ExtraArgs={'ContentType':'image/webp','ACL':'public-read'})
            urls.append(f"{R2_PUBLIC}/{key}"); up += 1
        except Exception as e:
            print(f"  FAIL {key}: {e}")
        time.sleep(0.05)
    if urls:
        sku_uploaded[sku] = urls
print(f"上传R2: {up} 张, {len(sku_uploaded)} 个SKU")

# ---- 4. 更新 products.json ----
print("Updating products.json...")
data = json.load(open(PRODUCTS_JSON, encoding='utf-8'))
updated = 0
for p in data['products']:
    if p['sku'] in sku_uploaded and not p.get('images'):
        p['images'] = sku_uploaded[p['sku']]
        updated += 1
json.dump(data, open(PRODUCTS_JSON,'w',encoding='utf-8'), ensure_ascii=False, indent=2)
print(f"更新 {updated} 个产品")

# 落盘结果
report = {"sku_uploaded": {k: v for k,v in sku_uploaded.items()},
          "updated": updated}
json.dump(report, open(WEBSITE_DIR/'.fix_img_report.json','w',encoding='utf-8'), ensure_ascii=False, indent=2)
print("报告: .fix_img_report.json")
print("DONE. 下一步运行 build_pages.py 重新生成页面")
