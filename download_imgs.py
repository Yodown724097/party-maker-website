"""
预下载PPT所需图片到本地 tmp_imgs/
"""
import sys, json, os, requests, time
sys.stdout.reconfigure(encoding='utf-8')

imgs = json.load(open('ppt_imgs.json', encoding='utf-8'))
os.makedirs('tmp_imgs', exist_ok=True)

downloaded = []
failed = []

for i, (sku, name, url) in enumerate(imgs):
    fname = f"tmp_imgs/{sku}_{i:03d}.jpg"
    if os.path.exists(fname):
        downloaded.append({'sku': sku, 'name': name, 'local': fname})
        continue
    try:
        r = requests.get(url, timeout=20)
        if r.status_code == 200:
            with open(fname, 'wb') as f:
                f.write(r.content)
            downloaded.append({'sku': sku, 'name': name, 'local': fname})
            print(f"[{i+1}/{len(imgs)}] OK  {sku}")
        else:
            failed.append(url)
            print(f"[{i+1}/{len(imgs)}] HTTP {r.status_code}  {sku}")
    except Exception as e:
        failed.append(url)
        print(f"[{i+1}/{len(imgs)}] ERR {e}  {sku}")
    time.sleep(0.1)

json.dump(downloaded, open('local_imgs.json', 'w', encoding='utf-8'), ensure_ascii=False)
print(f"\nDone: {len(downloaded)} OK, {len(failed)} failed")
