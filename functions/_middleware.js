/**
 * Cloudflare Pages Middleware
 * 
 * 1. 301 redirect party-maker-website.pages.dev → www.partymaker.cn
 * 2. Return 404 for /product/:sku/ where SKU is not a valid product
 *    (overrides SPA fallback that serves index.html for missing routes)
 */

// Build a Set of valid SKUs at module load time (imported from shared data)
import { PRODUCT_INTERNAL } from './_shared/product-data.js';

// Extract all valid SKUs from the product data
const VALID_SKUS = new Set(Object.keys(PRODUCT_INTERNAL));

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  const hostname = url.hostname;

  // Fix 1: Redirect pages.dev domain to main domain (301)
  if (hostname === 'party-maker-website.pages.dev') {
    const targetUrl = `https://www.partymaker.cn${url.pathname}${url.search}`;
    return Response.redirect(targetUrl, 301);
  }

  // Fix 2: Validate /product/:sku/ routes — return 404 if SKU doesn't exist
  const productMatch = url.pathname.match(/^\/product\/([^/]+)\/?$/);
  if (productMatch) {
    const sku = productMatch[1];
    if (!VALID_SKUS.has(sku)) {
      return new Response(
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - Product Not Found | Party Maker</title>
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="https://www.partymaker.cn/">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Poppins',-apple-system,sans-serif;background:#F7F9F5;color:#4A5A3A;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}
    .container{max-width:500px}
    h1{font-size:5rem;color:#9CAF88;line-height:1;margin-bottom:1rem}
    h2{font-size:1.5rem;font-weight:600;margin-bottom:0.75rem}
    p{color:#627252;margin-bottom:1.5rem;line-height:1.6}
    a{display:inline-block;background:#9CAF88;color:#fff;padding:0.75rem 2rem;border-radius:8px;text-decoration:none;font-weight:600;transition:background 0.2s}
    a:hover{background:#4E5E42}
  </style>
</head>
<body>
  <div class="container">
    <h1>404</h1>
    <h2>Product Not Found</h2>
    <p>The product you're looking for (SKU: ${sku}) doesn't exist or has been removed.</p>
    <a href="https://www.partymaker.cn/">Browse All Products</a>
  </div>
</body>
</html>`,
        {
          status: 404,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=86400',
          },
        }
      );
    }
  }

  // All other requests pass through normally
  return next();
}
