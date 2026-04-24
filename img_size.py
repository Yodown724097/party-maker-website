"""读取JPEG图片尺寸并写入local_imgs.json"""
import sys, json, struct
sys.stdout.reconfigure(encoding='utf-8')

def jpeg_size(f):
    f.read(2)
    while True:
        marker = f.read(2)
        if len(marker) < 2:
            return None, None
        if marker[0] != 0xFF:
            return None, None
        if marker[1] == 0xD9 or marker[1] == 0xDA:
            return None, None
        length = struct.unpack('>H', f.read(2))[0]
        if marker[1] in (0xC0, 0xC1, 0xC2):
            f.read(1)
            h = struct.unpack('>H', f.read(2))[0]
            w = struct.unpack('>H', f.read(2))[0]
            return w, h
        f.read(length - 2)

imgs = json.load(open('local_imgs.json', encoding='utf-8'))
for img in imgs:
    try:
        with open(img['local'], 'rb') as f:
            w, h = jpeg_size(f)
            img['w'] = w or 1
            img['h'] = h or 1
    except:
        img['w'] = 1
        img['h'] = 1

json.dump(imgs, open('local_imgs.json', 'w', encoding='utf-8'), ensure_ascii=False)
ratios = [round(i['w']/i['h'], 2) for i in imgs]
print(f'Images: {len(imgs)}')
print(f'Ratio range: {min(ratios):.2f} ~ {max(ratios):.2f}')
sample = imgs[0]
print(f'Sample: {sample["local"]} -> {sample["w"]}x{sample["h"]}')
