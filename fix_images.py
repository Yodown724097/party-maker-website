import json
import boto3
from botocore.config import Config
import sys

sys.stdout.reconfigure(encoding='utf-8')

# 读取 products.json
with open(r'c:\Users\Administrator\WorkBuddy\20260423171832\party-maker-website\products.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

products = data['products']

# 找出 images 为空的产品
empty_imgs = [p for p in products if not p.get('images')]
print(f"images 为空的产品数: {len(empty_imgs)}")

# 连接 R2（使用 upload_r2.py 的正确凭证）
s3 = boto3.client('s3',
    endpoint_url='https://cdd100719805df54e62bee48d165b2dd.r2.cloudflarestorage.com',
    aws_access_key_id='6ba9614989d68d1b8f7f7d6b53f50e54',
    aws_secret_access_key='10d4b41750b6965866db2bac4f33c8d6be56679219efe4cab6ae0211eacd6d80',
    region_name='auto',
    config=Config(signature_version='s3v4')
)

# 从 R2 恢复图片
restored = 0
for p in empty_imgs:
    sku = p['id']
    prefix = f"{sku}/"
    try:
        resp = s3.list_objects_v2(Bucket='party-maker', Prefix=prefix)
        contents = resp.get('Contents', [])
        if contents:
            # 按文件名排序
            contents.sort(key=lambda x: x['Key'])
            urls = [f"https://pub-1fd965ab66464286847edcb540254451.r2.dev/{obj['Key']}" for obj in contents]
            p['images'] = urls
            restored += 1
            if restored <= 10:
                print(f"  {sku}: 找到 {len(urls)} 张图片")
        else:
            if restored <= 10:
                print(f"  {sku}: R2 上无图片")
    except Exception as e:
        if restored <= 10:
            print(f"  {sku}: 错误 {e}")

print(f"\n总共恢复: {restored} 个产品")

if restored > 0:
    # 保存
    with open(r'c:\Users\Administrator\WorkBuddy\20260423171832\party-maker-website\products.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("已保存到 products.json")
    
    # 同时更新 products-public.json（不含 _costPrice）
    products_public = []
    for p in products:
        pub = {k: v for k, v in p.items() if not k.startswith('_')}
        products_public.append(pub)
    
    with open(r'c:\Users\Administrator\WorkBuddy\20260423171832\party-maker-website\products-public.json', 'w', encoding='utf-8') as f:
        json.dump({'products': products_public}, f, ensure_ascii=False, indent=2)
    print("已更新 products-public.json")
else:
    print("没有恢复任何图片，请检查 R2 上的图片是否存在")
