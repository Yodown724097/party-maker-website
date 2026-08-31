# -*- coding: utf-8 -*-
"""
PartyMaker 全站注入 Google Analytics (G-HYERFKYG25) gtag 代码
铁律遵循：
- 幂等：已含 gtag 的页面跳过
- 位置：紧跟在 <head> 标签之后
- 落盘：进度/校验结果写文件
"""
import os, re, sys

GTAG_ID = "G-HYERFKYG25"
GTAG_HTML = (
    '    <!-- Google tag (gtag.js) -->\n'
    '    <script async src="https://www.googletagmanager.com/gtag/js?id=G-HYERFKYG25"></script>\n'
    '    <script>\n'
    '      window.dataLayer = window.dataLayer || [];\n'
    '      function gtag(){dataLayer.push(arguments);}\n'
    "      gtag('js', new Date());\n\n"
    "      gtag('config', 'G-HYERFKYG25');\n"
    '    </script>\n'
)

HEAD_RE = re.compile(r'<head[^>]*>', re.IGNORECASE)
GTAG_RE = re.compile(r'googletagmanager\.com/gtag/js\?id=G-HYERFKYG25')

ROOT = r"D:\AI\Work Buddy files\party-maker-website"
LOG = os.path.join(ROOT, "gtag_inject.log")

def collect_html_files():
    """收集所有 .html 文件（排除 node_modules）"""
    files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d != "node_modules" and d != ".git"]
        for fn in filenames:
            if fn.lower().endswith(".html"):
                files.append(os.path.join(dirpath, fn))
    return files

def main():
    all_files = collect_html_files()
    modified, skipped_existing, skipped_no_head = [], [], []

    # 分页处理：先把已注入的找出来（中断恢复场景）
    # 但单次直接跑，1067 个文件足够快，全量处理一次
    for i, fp in enumerate(all_files, 1):
        try:
            with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except Exception as e:
            skipped_existing.append((fp, f"READ_ERR:{e}"))
            continue

        # 幂等：已含 gtag 则跳过
        if GTAG_RE.search(content):
            skipped_existing.append((fp, "ALREADY_HAS_GTAG"))
            continue

        m = HEAD_RE.search(content)
        if not m:
            skipped_no_head.append(fp)
            continue

        pos = m.end()
        new_content = content[:pos] + "\n" + GTAG_HTML + content[pos:]

        with open(fp, "w", encoding="utf-8", newline="") as f:
            f.write(new_content)

        modified.append(fp)

        if i % 200 == 0:
            print(f"[进度] {i}/{len(all_files)}  已注入 {len(modified)}", flush=True)

    # 写日志
    with open(LOG, "w", encoding="utf-8") as f:
        f.write(f"GTAG injection report — {GTAG_ID}\n")
        f.write(f"Total HTML: {len(all_files)}\n")
        f.write(f"Modified (injected): {len(modified)}\n")
        f.write(f"Skipped (already had or read err): {len(skipped_existing)}\n")
        f.write(f"Skipped (no <head> tag): {len(skipped_no_head)}\n\n")
        f.write("=== Modified files ===\n")
        for fp in modified:
            f.write(fp + "\n")
        if skipped_existing:
            f.write("\n=== Skipped: already has gtag or error ===\n")
            for fp, why in skipped_existing:
                f.write(f"{why}\t{fp}\n")
        if skipped_no_head:
            f.write("\n=== Skipped: no <head> tag ===\n")
            for fp in skipped_no_head:
                f.write(fp + "\n")

    print("\n========== 完成 ==========")
    print(f"HTML 总数: {len(all_files)}")
    print(f"成功注入: {len(modified)}")
    print(f"跳过(已有/错误): {len(skipped_existing)}")
    print(f"跳过(无 head): {len(skipped_no_head)}")
    for fp, why in skipped_existing:
        print(f"  [{why}] {fp}")
    for fp in skipped_no_head:
        print(f"  [NO_HEAD] {fp}")
    print(f"日志: {LOG}")

if __name__ == "__main__":
    main()
