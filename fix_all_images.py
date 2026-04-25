import json
import boto3
from botocore.config import Config
import sys
import re

sys.stdout.reconfigure(encoding='utf-8')

# 读取 products.json
with open(r'c:\Users\Administrator\WorkBuddy\20260423171832\party-maker-website\products.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

products = data['products']

# 连接 R2
s3 = boto3.client('s3',
    endpoint_url='https://cdd100719805df54e62bee48d165b2dd.r2.cloudflarestorage.com',
    aws_access_key_id='6ba9614989d68d1b8f7f7d6b53f50e54',
    aws_secret_access_key='10d4b41750b6965866db2bac4f33c8d6be56679219efe4cab6ae0211eacd6d80',
    region_name='auto',
    config=Config(signature_version='s3v4')
)

# 检查函数：URL 是否包含非 ASCII 字符或空格
def is_valid_url(url):
    # 检查是否包含中文字符或乱码
    if re.search(r'[^\x00-\x7F]', url):
        return False
    # 检查是否有未编码的空格
    if ' ' in url and '%20' not in url:
        return False
    return True

# 修复统计
fixed = 0
failed = 0

for p in products:
    sku = p['id']
    images = p.get('images', [])
    
    # 检查是否需要修复
    need_fix = False
    if not images:
        need_fix = True  # 空数组，需要从 R2 恢复
    else:
        # 检查是否有非法 URL
        for url in images:
            if not is_valid_url(url):
                need_fix = True
                break
    
    if need_fix:
        # 从 R2 重新获取文件列表
        prefix = f"{sku}/"
        try:
            resp = s3.list_objects_v2(Bucket='party-maker', Prefix=prefix)
            contents = resp.get('Contents', [])
            if contents:
                # 按文件名排序
                contents.sort(key=lambda x: x['Key'])
                urls = [f"https://pub-1fd965ab66464286847edcb540254451.r2.dev/{obj['Key']}" for obj in contents]
                p['images'] = urls
                fixed += 1
                if fixed <= 10:
                    print(f"  修复 {sku}: {len(urls)} 张图片")
            else:
                failed += 1
                if failed <= 10:
                    print(f"  {sku}: R2 上无图片")
        except Exception as e:
            failed += 1
            if failed <= 10:
                print(f"  {sku}: 错误 {e}")

print(f"\n总共修复: {fixed} 个产品")
print(f"失败（R2 上无图片）: {failed} 个产品")

# 保存 products.json
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
