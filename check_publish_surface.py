#!/usr/bin/env python3
"""
公开面守门脚本 —— 防止「仓库里新增的文件悄悄变成公网可下载」。

背景：Cloudflare Pages 的发布目录就是仓库根，凡是 git 跟踪的文件（functions/ 除外）
都会被公网直接下载。functions/_middleware.js + _routes.json 负责把不该公开的文件返回 404。
但两者都是手写清单，容易随新增文件失效 —— 本脚本就是那个「发现失效」的闸门。

检查四件事：
  1. _routes.json 合法、规则数 ≤100、必须含 /api/* 与 /img/*、不含任何公开路径
  2. 每个 git 跟踪的文件都能被明确分类（公开 或 拦截），没有「漏网」
  3. 判定为「该拦」的文件，必须同时被 _routes.json 覆盖
     —— 否则请求根本不会进中间件，Pages 会直接吐静态文件（静默泄露）
  4. 公开名单里的文件，不能被中间件规则误伤

用法：
  python check_publish_surface.py             # 静态检查（默认）
  python check_publish_surface.py --online    # 静态检查 + 线上实测
  python check_publish_surface.py --online --wait
                                              # 线上实测，先轮询等新构建生效

退出码：0 = 全部通过；1 = 存在漏网/不一致

⛔ 为什么需要 --online：
  维护的是线上不可下载，而"改了没生效"这件事是**静默的** ——
  Cloudflare 构建失败时会保留旧版本继续服务，静态检查全绿也可能线上照旧泄露。
  只有真去访问一遍才知道。
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent
ROUTES_JSON = REPO / "_routes.json"
MIDDLEWARE_JS = REPO / "functions" / "_middleware.js"

MAX_RULES = 100

# ── 不该被拦的路径 ──────────────────────────────────────────────
# 两类：① 必须能被公网访问的对外资源；② 由 Pages 自己消费、本就不对外的特殊文件
PUBLIC_EXACT = {
    "/index.html",
    "/app.js",
    "/cart.js",
    "/style.css",
    "/products-public.json",
    "/blog.json",
    "/sitemap.xml",
    "/robots.txt",
    "/mihomo.yaml",          # 老板有意发布的 VPN 订阅地址
    "/_headers",             # ② Pages 自己消费，实测取不到
    "/_redirects",           # ② 同上
    "/_routes.json",         # ② 同上（Functions 调用路由表）
}

# 这些目录下的内容是对外页面，整目录公开
PUBLIC_DIRS = ("product/", "ramadan/", "diwali/", "blog/")

# 这些目录不是静态资源（functions/ 由 Pages 执行，不对外提供；__pycache__ 从不入库）
IGNORED_DIRS = ("functions/", "__pycache__/")


# ── 从中间件源码里抽出三张清单（唯一事实基，避免两处手抄不一致）────
def parse_middleware() -> tuple[set[str], list[str], set[str]]:
    src = MIDDLEWARE_JS.read_text(encoding="utf-8")

    def grab_array(name: str) -> list[str]:
        # 兼容 `= [...]` 和 `= new Set([...])` 两种写法
        m = re.search(rf"{name}\s*=\s*(?:new\s+Set\()?\[(.*?)\]", src, re.S)
        if not m:
            raise SystemExit(f"❌ 无法从 _middleware.js 解析出 {name}")
        return re.findall(r"'([^']+)'", m.group(1))

    def grab_set(name: str) -> set[str]:
        return set(grab_array(name))

    return grab_set("BLOCK_EXACT"), grab_array("BLOCK_PREFIX"), grab_set("BLOCK_EXT")


def glob_to_regex(pattern: str) -> re.Pattern[str]:
    """把 _routes.json 里的 * 通配转成正则：* 匹配任意字符（含 /，Cloudflare 语义）"""
    return re.compile("^" + re.escape(pattern).replace(r"\*", ".*") + "$")


def main() -> int:
    problems: list[str] = []

    # ── 1. _routes.json 基础校验 ────────────────────────────────
    routes = json.loads(ROUTES_JSON.read_text(encoding="utf-8"))
    include = routes.get("include", [])
    exclude = routes.get("exclude", [])
    total = len(include) + len(exclude)

    if total > MAX_RULES:
        problems.append(f"_routes.json 规则数 {total} 超过 Cloudflare 上限 {MAX_RULES}")

    # ⛔ 2026-09-17 实测踩坑：中间带通配符的规则（如 "/*.py"、"/*.md"）会让
    #    Cloudflare Pages 构建直接失败 —— 且失败时**保留旧版本**，线上毫无征兆，
    #    只有部署列表里能看到。通配符只能出现在规则末尾（/* 或 /xxx/*）。
    for rule in include + exclude:
        if "*" in rule and not rule.endswith("*"):
            problems.append(
                f"_routes.json 规则 {rule!r} 的 * 不在末尾 —— "
                f"Cloudflare 会拒绝并导致构建失败（实测），请改为显式列举"
            )
    for rule in include + exclude:
        if len(rule) > 100:
            problems.append(f"_routes.json 规则 {rule!r} 超过 100 字符上限")

    for required in ("/api/*", "/img/*"):
        if required not in include:
            problems.append(
                f"_routes.json include 缺少 {required} —— "
                f"{'生产接口' if required == '/api/*' else '产品图代理'}会失效"
            )
    for path in PUBLIC_EXACT:
        if path in include and path not in exclude:
            problems.append(f"_routes.json 把公开路径 {path} 写进了 include，会被误拦")

    # ── 2. 中间件清单 ───────────────────────────────────────────
    block_exact, block_prefix, block_ext = parse_middleware()

    def is_blocked(path: str) -> bool:
        p = "/" + path.lstrip("/").rstrip("/").lower()
        if any(p.startswith(pre) for pre in block_prefix):
            return True
        if p in block_exact:
            return True
        dot = p.rfind(".")
        return dot > 0 and p[dot:] in block_ext

    include_res = [glob_to_regex(pat) for pat in include]

    def is_routed(pub_path: str) -> bool:
        return any(r.match(pub_path) for r in include_res)

    # ── 3. 遍历所有 git 跟踪文件 ────────────────────────────────
    out = subprocess.run(
        ["git", "-c", "core.quotepath=false", "ls-files", "-z"],
        cwd=REPO, capture_output=True, text=True,
        encoding="utf-8", errors="replace",
    )
    if out.returncode != 0:
        raise SystemExit("❌ git ls-files 执行失败")
    # -z：NUL 分隔，非 ASCII 路径不会被 git 加引号转义
    tracked = [f for f in out.stdout.split("\0") if f.strip()]

    misclassified: list[str] = []   # 归类不明：既不公开也不拦
    not_routed: list[str] = []      # 该拦但 _routes.json 没覆盖 → 静默泄露

    for f in tracked:
        pub = "/" + f
        if f.endswith("/"):
            continue
        if f.startswith(IGNORED_DIRS):
            continue

        should_public = pub in PUBLIC_EXACT or f.startswith(PUBLIC_DIRS)
        blocked = is_blocked(f)

        if should_public:
            if blocked:
                problems.append(f"公开文件被中间件误拦：{f}")
        else:
            if not blocked:
                misclassified.append(f)
            elif not is_routed(pub):
                not_routed.append(f)

    if misclassified:
        problems.append(
            f"{len(misclassified)} 个文件既不在公开名单、也没被拦截 —— 当前正被公网下载：\n    "
            + "\n    ".join(sorted(misclassified)[:15])
        )
    if not_routed:
        problems.append(
            f"{len(not_routed)} 个文件该拦但 _routes.json 没覆盖（请求进不了中间件，会静默泄露）：\n    "
            + "\n    ".join(sorted(not_routed)[:15])
        )

    # ── 4. 输出 ─────────────────────────────────────────────────
    public_count = sum(
        1 for f in tracked
        if not f.startswith(IGNORED_DIRS)
        and (("/" + f) in PUBLIC_EXACT or f.startswith(PUBLIC_DIRS))
    )
    blocked_count = sum(
        1 for f in tracked
        if not f.startswith(IGNORED_DIRS)
        and not (("/" + f) in PUBLIC_EXACT or f.startswith(PUBLIC_DIRS))
    )

    print("公开面守门检查")
    print(f"  git 跟踪文件      : {len(tracked)}")
    print(f"  判定为公开        : {public_count}")
    print(f"  判定为拦截        : {blocked_count}")
    print(f"  _routes.json 规则 : {total} / {MAX_RULES}")
    print(f"  中间件拦截清单    : exact {len(block_exact)} 条 / prefix {len(block_prefix)} 条 / ext {len(block_ext)} 类")
    print()

    if problems:
        for p in problems:
            print(f"❌ {p}")
        print()
        print(f"FAIL  共 {len(problems)} 个问题")
        return 1

    print("PASS  公开面完整，无漏网文件")
    return 0


# ── 线上实测 ──────────────────────────────────────────────────────
SITE = "https://www.partymaker.cn"
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120 Safari/537.36"
}
HOME_LEN = 45729   # 首页长度：Pages 对不存在的路径回落首页，用它识别「假 200」

# 线上必须存活的对外资源（少一个都不行）
PUBLIC_PROBE = [
    ("/", "首页"), ("/index.html", ""),
    ("/product/605040/", "产品页"), ("/ramadan/", "品类页"),
    ("/diwali/", "品类页"), ("/blog/", "博客"),
    ("/products-public.json", "站点数据源"), ("/blog.json", ""),
    ("/app.js", ""), ("/cart.js", ""), ("/style.css", ""),
    ("/sitemap.xml", "SEO"), ("/robots.txt", "SEO"),
]
# Function 路由：包在产品图代理里，漏了它全站图全挂
FUNCTION_PROBE = ["/img/605040/01.webp", "/api/save-list", "/api/generate"]


def _fetch(path: str, method: str = "GET"):
    req = urllib.request.Request(SITE + path, headers=UA, method=method)
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            return resp.status, resp.read(), resp.headers.get("Content-Type", "") or ""
    except urllib.error.HTTPError as e:
        try:
            body = e.read()
        except Exception:
            body = b""
        ct = (e.headers.get("Content-Type", "") if e.headers else "") or ""
        return e.code, body, ct
    except Exception as e:
        return -1, str(e).encode(), ""


def online_check(blocked_paths: list[str], wait: bool = False) -> int:
    problems: list[str] = []

    def note(ok: bool, text: str) -> None:
        print(f"  {'ok  ' if ok else 'FAIL'} {text}")
        if not ok:
            problems.append(text)

    if wait:
        print("等待新构建生效（轮询 /check_publish_surface.py 变为 404）...")
        deadline = time.time() + 420
        while time.time() < deadline:
            code, body, _ = _fetch("/check_publish_surface.py")
            if code == 404:
                print("  已生效\n")
                break
            time.sleep(10)
        else:
            print("  ⏰ 超时 —— 构建可能失败（失败会保留旧版本继续服务）\n")

    print("=== 线上：内部文件必须 404 ===")
    for p in blocked_paths:
        code, body, _ = _fetch(p)
        leak = code == 200 and len(body) != HOME_LEN
        note(code == 404, f"{code} {len(body):>7}B  {p}" + ("   🔴 仍在泄露!" if leak else ""))

    print("\n=== 线上：对外资源必须真内容 ===")
    for p, label in PUBLIC_PROBE:
        code, body, _ = _fetch(p)
        is_home = len(body) == HOME_LEN
        ok = code == 200 and (is_home if p in ("/", "/index.html") else not is_home)
        note(ok, f"{code} {len(body):>7}B  {p:<38} {label}")

    print("\n=== 线上：mihomo.yaml 不拦（老板明确要求）===")
    code, body, _ = _fetch("/mihomo.yaml")
    note(code == 200 and b"proxies:" in body, f"{code} {len(body):>7}B  /mihomo.yaml")

    print("\n=== 线上：Function 路由必须存活 ===")
    for p in FUNCTION_PROBE:
        code, _, ct = _fetch(p)
        note(code in (200, 400, 404, 405) and "text/html" not in ct, f"{code} {ct:<26} {p}")

    print()
    if problems:
        print(f"FAIL  线上实测 {len(problems)} 项不符")
        return 1
    print("PASS  线上实测全部通过")
    return 0


if __name__ == "__main__":
    args = set(sys.argv[1:])
    rc = main()
    if "--online" in args:
        # 只抽测根级显式规则 + 少量 .workbuddy 样本（数量可控，够发现问题）
        routes = json.loads(ROUTES_JSON.read_text(encoding="utf-8"))["include"]
        roots = [r for r in routes if r not in ("/api/*", "/img/*") and not r.startswith("/.workbuddy/")]
        samples = [
            "/.workbuddy/memory/MEMORY.md",
            "/.workbuddy/memory/2026-09-11.md",
            "/.workbuddy/seo_queue.json",
            "/.workbuddy/vps_blog_daily.py",
            "/.workbuddy/automations/automation-1780929777036/memory.md",
        ]
        print()
        rc = max(rc, online_check(roots + samples, wait="--wait" in args))
    sys.exit(rc)
