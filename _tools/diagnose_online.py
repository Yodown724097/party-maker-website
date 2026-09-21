#!/usr/bin/env python3
"""线上诊断 —— 强制正确的验证方法，杜绝「看状态码就下结论」。

存在理由（2026-09-21 实录）：
  我在同一天里，因为**只看 HTTP 状态码**，连续误判两次：
    · 看到 200 → 宣布「CF 部署没生效」
      → 真相：部署成功，只是**边缘缓存**还留着旧副本
        （响应头 `CF-Cache-Status: HIT` / `Age: 1393` / `s-maxage=604800`）
      → 带上 `?cb=<随机>` 一测，立刻返回 fallback 首页 = 文件其实已删除
    · 看到 404 → 宣布「GitHub 仓库不存在」
      → 真相：连接器是 GitHub App token，只能看被授权的仓库

  共同根因：**单点证据 → 直接下结论，缺"反证"这一步。**
  这个脚本把正确方法固化成程序，不靠当时的判断力。

用法：
    python _tools/diagnose_online.py <URL> [URL...]
    python _tools/diagnose_online.py https://www.partymaker.cn/xxx.json

输出的每条结论都标注证据等级：
    [实测] 有命令输出支撑  |  [推断] 由实测推导  |  [未知] 证据不足
"""
from __future__ import annotations

import random
import ssl
import sys
import urllib.error
import urllib.request
from urllib.parse import urlparse

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE
UA = {"User-Agent": "Mozilla/5.0 (diagnostic)"}


def fetch(url: str, method: str = "GET", timeout: int = 20):
    """返回 (status, headers_dict, body_bytes)。失败返回 (None, {}, b'')。"""
    try:
        req = urllib.request.Request(url, method=method, headers=UA)
        with urllib.request.urlopen(req, context=CTX, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), (e.read() or b"")
    except Exception:
        return None, {}, b""


def looks_like_html(body: bytes) -> bool:
    head = body[:200].lstrip().lower()
    return head.startswith(b"<!doctype html") or head.startswith(b"<html")


def diagnose(url: str) -> list[str]:
    """对单个 URL 做完整诊断，返回带证据等级的结论行。"""
    out = []
    parsed = urlparse(url)
    base = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    out.append(f"\n{'=' * 66}\n{url}\n{'=' * 66}")

    # ── 1. 普通请求 ────────────────────────────────────────────────
    st, hd, body = fetch(url)
    if st is None:
        out.append("  [实测] 请求失败（网络不可达 / DNS 未解析）")
        return out

    cache_status = hd.get("CF-Cache-Status") or hd.get("cf-cache-status") or "-"
    age = hd.get("Age") or hd.get("age") or "-"
    cc = hd.get("Cache-Control") or hd.get("cache-control") or "-"
    out.append(f"  [实测] 状态码 {st}，响应体 {len(body)} 字节")
    out.append(f"  [实测] CF-Cache-Status={cache_status}  Age={age}")
    out.append(f"  [实测] Cache-Control: {cc}")
    out.append(f"  [实测] 内容是 HTML？ {looks_like_html(body)}")

    # ── 2. 绕过缓存（关键反证步骤）────────────────────────────────
    bust = f"{url}{'&' if '?' in url else '?'}cb={random.randint(100000, 999999)}"
    st2, _, body2 = fetch(bust)
    out.append(f"  [实测] 绕过缓存后：状态 {st2}，{len(body2)} 字节，"
               f"HTML={looks_like_html(body2)}")

    # ── 3. 基准：一个确定不存在的路径（识别 fallback 行为）─────────
    probe = f"{parsed.scheme}://{parsed.netloc}/__nonexistent_probe_{random.randint(1000,9999)}.json"
    st3, _, body3 = fetch(probe)
    out.append(f"  [实测] 不存在的路径基准：状态 {st3}，{len(body3)} 字节，"
               f"HTML={looks_like_html(body3)}")

    # ── 4. 结论（标注证据等级）────────────────────────────────────
    out.append("  " + "-" * 62)
    fallback_like = body3[:200] == body2[:200] and looks_like_html(body2)

    if cache_status.upper() == "HIT" and st == 200 and not body:
        out.append("  [推断] 缓存命中且响应体为空 —— 需要重试确认")
    elif cache_status.upper() == "HIT" and not fallback_like:
        out.append("  [推断] 本次 200 **来自边缘缓存**，不代表文件仍存在于部署中")
        out.append("         → 看「绕过缓存」那一行才是真相")
    elif fallback_like:
        out.append("  [实测] 绕过缓存后返回的内容 **等同于不存在路径的 fallback**")
        out.append("         → 该路径在部署中**已不存在**（返回的是站点兜底页）")
    elif st2 == 404:
        out.append("  [实测] 已下线（404）")
    elif st == 200 and st2 == 200 and not fallback_like:
        out.append("  [实测] 文件**真实存在且在线**（绕过缓存仍返回真实内容）")
    else:
        out.append(f"  [未知] 证据不足：原始 {st} / 绕缓存 {st2} / 基准 {st3}")
        out.append("         → 别下结论，补测")

    if cc != "-" and "s-maxage" in str(cc).lower() and cache_status.upper() == "HIT":
        out.append(f"  [推断] 缓存有效期来自 Cache-Control，过期前会一直返回旧副本")
        out.append("         → 想立刻生效：CF 控制台 Caching → Purge")

    return out


def main() -> int:
    urls = [a for a in sys.argv[1:] if a.startswith("http")]
    if not urls:
        print(__doc__)
        return 2

    print("线上诊断（结论均标注证据等级）")
    for u in urls:
        for line in diagnose(u):
            print(line)
    print()
    print("提醒：`CF-Cache-Status: HIT` 时，300+ 的状态码一概不可信 —— 必须看绕过缓存的结果。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
