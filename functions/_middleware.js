/**
 * Cloudflare Pages 根中间件 —— 屏蔽仓库内不该对外公开的文件
 *
 * ── 为什么需要它 ────────────────────────────────────────────────
 * Cloudflare Pages 的「发布目录」就是仓库根：凡是 git 跟踪的文件（functions/ 除外）
 * 都会被公网直接下载。放进子目录也一样公开，子目录不是保护。
 * 唯一可行的机制就是 _routes.json + 本中间件。
 *
 *   _routes.json  →  负责把命中清单的请求交给 Functions
 *   本中间件      →  负责对这些请求返回 404
 *   （两者缺一不可：只路由不拦截时，Pages 仍可能回落去读静态资源）
 *
 * ── 安全设计（改动时务必保持）──────────────────────────────────
 *   1. 只拦命中清单的路径，其余一律 next() 放行
 *   2. 整体 try/catch，任何异常都 fail-open 放行
 *      → 本文件自身出 bug 也绝不会影响生产
 *   3. 清单里永不出现 /api/* 与 /img/*：
 *      /api/* 是询盘、报价单、保存清单等生产接口
 *      /img/* 是产品图代理（/img/SKU/图 → R2），拦了全站图全挂
 *   4. /mihomo.yaml 是老板有意发布的 VPN 订阅地址，明确不在拦截范围
 *
 * 公开资源清单（必须保持可访问，勿加入拦截）：
 *   /  /index.html  /app.js  /cart.js  /style.css
 *   /products-public.json  /blog.json  /sitemap.xml  /robots.txt  /mihomo.yaml
 *   /product/*  /ramadan/*  /diwali/*  /blog/*
 *
 * 新增内部文件后，请跑 `python check_publish_surface.py` 复核清单是否仍然完整。
 */

// ── 精确路径（根级内部文件）────────────────────────────────────
// 全部小写；匹配前路径会被转小写
// ⚠️ 已于 2026-09-17 从 git 移除的 4 个 products 备份不再列在此处
//    （products.json.backup / .backup.20260425 / .bak / products-public.json.backup）
//    —— 它们已不在仓库里，Pages 不再发布，无需拦截。
const BLOCK_EXACT = new Set([
  '/.build_cache.json',
  '/.env.example',
  '/.gitignore',
  '/indexed_product_skus.json',
  '/make_ppt.js',
  '/missing_images_88.txt',
  '/package-lock.json',
  '/package.json',
  '/products.json',
]);

// ── 目录前缀（含子目录，一律拦）────────────────────────────────
const BLOCK_PREFIX = [
  '/.workbuddy/',
];

// ── 内部文件扩展名 ─────────────────────────────────────────────
// 这些后缀在公开资源里一个都不用，可安全整类拦（新增同后缀文件自动被拦）
const BLOCK_EXT = new Set([
  '.py',
  '.pyc',
  '.md',
  '.docx',
  '.log',
]);

/**
 * @param {string} pathname URL 路径（未解码前的 pathname）
 * @returns {boolean} true = 应返回 404
 */
function isBlocked(pathname) {
  // 去掉尾部斜杠并对齐大小写，避免 /products.json/ 这类绕过
  const p = pathname.replace(/\/+$/, '').toLowerCase() || '/';

  if (BLOCK_PREFIX.some((prefix) => p.startsWith(prefix))) return true;
  if (BLOCK_EXACT.has(p)) return true;

  const dot = p.lastIndexOf('.');
  if (dot > 0 && BLOCK_EXT.has(p.slice(dot))) return true;

  return false;
}

export async function onRequest(context) {
  const { request, next } = context;

  try {
    const url = new URL(request.url);
    if (isBlocked(url.pathname)) {
      return new Response('Not Found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      });
    }
  } catch (err) {
    // fail-open：中间件自身异常绝不能影响生产，直接放行
    console.error('[middleware] isBlocked 异常，已放行:', err);
  }

  return next();
}
