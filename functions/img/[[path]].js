/**
 * Cloudflare Pages Function — Image proxy for R2
 * Proxies /img/SKU/file -> https://pub-...r2.dev/SKU/file
 * Solves MaxHub and certain browser network compatibility issues
 * where the raw R2 domain is unreachable.
 */
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  // path is /img/{sku}/{filename}
  const path = url.pathname.replace(/^\/img\//, '');

  if (!path || path.includes('..')) {
    return new Response('Invalid path', { status: 400 });
  }

  const r2Url = `https://pub-1fd965ab66464286847edcb540254451.r2.dev/${path}`;

  const response = await fetch(r2Url, {
    cf: {
      cacheTtl: 86400,
      cacheEverything: true,
    },
  });

  if (!response.ok) {
    return new Response('Not found', { status: 404 });
  }

  // Clone and add caching + CORS headers
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('CDN-Cache-Control', 'public, max-age=604800');
  return newResponse;
}
