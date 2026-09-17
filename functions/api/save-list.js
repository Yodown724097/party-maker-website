/**
 * Cloudflare Pages Function - Save / Email My List
 * 用 Resend API 把「已选清单的恢复链接」发到客户自己填的邮箱。
 *
 * 为什么需要它：客户在 A 电脑选好一车货，换到 B 电脑（或手机）打开网站，
 * 购物车是空的（localStorage 只存在本地浏览器）。给他一封邮件，点链接
 * 就能把那份清单原样带回来 —— 不用注册、不用密码。
 *
 * 安全边界（这是能对外发信的接口，必须收紧）：
 *   1. 收件人只能是请求里填的那个邮箱本身 —— 不抄送任何第三方，无法用来给别人发垃圾邮件
 *   2. 邮件正文是固定模板 + 产品列表，**不接受任何客户自由文本** —— 无法用来发钓鱼话术
 *   3. 链接由服务端用「货号 + 数量」重新拼，域名硬编码为本站 —— 无法注入外链
 *   4. 只发一封，不抄送内部（避免每存一次清单就往老板邮箱塞一封）
 */

const SITE_ORIGIN = 'https://www.partymaker.cn';
const FROM_ADDRESS = 'Party Maker <info@partymaker.cn>';
const SHARE_PARAM = 'load';

const QTY_STEP = 12;          // 与 cart.js 的 STEP 一致
const MAX_ITEMS = 200;        // 防御：异常长的清单直接拒绝
const MAX_SKU_LEN = 64;       // 货号最长 64 字符（实测最长 ~20）
const MAX_BODY_BYTES = 16 * 1024;   // 200 条 × ~20 字符 = 4KB 足够；超出直接拒

// 同站校验的放行名单。这个接口会消耗 Resend 配额（免费版 100 封/天），
// 被刷会连累真实询盘邮件，所以挡掉「别的网站拿它当免费发信机」这一类用法。
// 注意：只在浏览器带了 Origin 且不在名单里时才拒绝 —— 没带 Origin 的请求
// 通常是服务端/命令行调用，放行以免误伤（真正的兜底是 Cloudflare 限流规则）。
const ALLOWED_ORIGIN_RE = /^https?:\/\/([a-z0-9-]+\.)*partymaker\.cn(:\d+)?$|^https?:\/\/([a-z0-9-]+\.)*pages\.dev$|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export async function onRequest({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResp({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  // 同站校验：带了对不上号的 Origin 说明是别的网站在调这个接口
  const origin = request.headers.get('Origin') || '';
  if (origin && !ALLOWED_ORIGIN_RE.test(origin)) {
    return jsonResp({ error: 'Forbidden' }, 403, corsHeaders);
  }

  // 体积闸门：先看声明的长度，避免把超大 body 读进内存
  const declaredLen = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (declaredLen > MAX_BODY_BYTES) {
    return jsonResp({ error: 'Payload too large' }, 413, corsHeaders);
  }

  try {
    const body = await request.json();
    const email = String(body.email || '').trim();
    const rawItems = Array.isArray(body.cart) ? body.cart : [];

    if (!isValidEmail(email)) {
      return jsonResp({ error: 'Please enter a valid email address' }, 400, corsHeaders);
    }
    if (rawItems.length === 0) {
      return jsonResp({ error: 'Your list is empty' }, 400, corsHeaders);
    }
    if (rawItems.length > MAX_ITEMS) {
      return jsonResp({ error: 'List is too long to email — please use "Copy link" instead' }, 400, corsHeaders);
    }

    // 归一化：只认货号 + 数量，其余字段（价格/图片/任何内部字段）一律丢弃。
    // 恢复时价格会从最新目录重新取，链接里绝不携带价格。
    const items = [];
    for (const it of rawItems) {
      const sku = String((it && (it.sku || it.id)) || '').trim();
      if (!sku || sku.length > MAX_SKU_LEN) continue;
      const qty = normalizeQty(it && (it.qty ?? it.quantity));
      items.push({ sku, qty });
    }
    if (items.length === 0) {
      return jsonResp({ error: 'Your list is empty' }, 400, corsHeaders);
    }

    const shareUrl = buildShareUrl(items);

    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      return jsonResp({ error: 'RESEND_API_KEY not configured' }, 500, corsHeaders);
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [email],
        subject: 'Your Party Maker saved list',
        text: buildText(items, shareUrl),
        html: buildHtml(items, shareUrl),
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return jsonResp({ error: (data && data.message) || 'Could not send the email' }, 502, corsHeaders);
    }

    return jsonResp({ success: true, email, items: items.length, id: data.id }, 200, corsHeaders);
  } catch (err) {
    return jsonResp({ success: false, error: err.message || 'Internal error' }, 500, corsHeaders);
  }
}

// ============================================================
// 链接构造
// ============================================================

/** 数量归一化：非法值→12，向上取整到 12 的整数倍 */
function normalizeQty(val) {
  let qty = parseInt(val, 10);
  if (!qty || qty < QTY_STEP) qty = QTY_STEP;
  return Math.ceil(qty / QTY_STEP) * QTY_STEP;
}

/** /?load=605040.24,642071.12 —— 只含货号与数量 */
function buildShareUrl(items) {
  const list = items.map(it => `${it.sku}.${it.qty}`).join(',');
  return `${SITE_ORIGIN}/?${SHARE_PARAM}=${encodeURIComponent(list)}`;
}

// ============================================================
// 邮件模板
// ============================================================

const OLIVE = '#9CAF88';
const OLIVE_BG = '#F7F9F5';

function buildHtml(items, shareUrl) {
  const rows = items.map((it, i) => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-size:13px;color:#888;">${i + 1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;font-weight:bold;">${esc(it.sku)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-size:13px;">${it.qty}</td>
    </tr>`).join('');

  const totalPcs = items.reduce((sum, it) => sum + it.qty, 0);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;padding:0;background:#f5f5f5;">
<div style="background:${OLIVE};color:white;padding:28px 32px;border-radius:12px 12px 0 0;">
  <h1 style="margin:0;font-size:22px;">Your saved list</h1>
  <p style="margin:8px 0 0;opacity:0.9;font-size:14px;">${items.length} product${items.length > 1 ? 's' : ''} &middot; ${totalPcs} pieces</p>
</div>

<div style="background:white;padding:24px 32px;border:1px solid #ddd;border-top:none;">
  <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 20px;">
    Keep this email. Open the link below on <strong>any computer or phone</strong> and the products
    you picked will be put back in your Inquiry Cart &mdash; no account, no password needed.
  </p>
  <div style="text-align:center;margin:0 0 20px;">
    <a href="${esc(shareUrl)}" style="display:inline-block;background:${OLIVE};color:white;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 34px;border-radius:8px;">Open my saved list</a>
  </div>
  <p style="font-size:12px;color:#999;line-height:1.6;margin:0;text-align:center;">
    Button not working? Copy this address into your browser:<br>
    <span style="color:#666;word-break:break-all;">${esc(shareUrl)}</span>
  </p>
</div>

<div style="background:white;padding:0 32px 24px;border:1px solid #ddd;border-top:none;">
  <p style="font-size:13px;color:#888;margin:0 0 12px;">What is in this list:</p>
  <table style="width:100%;border-collapse:collapse;">
    <thead><tr style="background:${OLIVE_BG};">
      <th style="padding:9px 12px;text-align:center;font-size:12px;color:#666;">#</th>
      <th style="padding:9px 12px;text-align:left;font-size:12px;color:#666;">SKU</th>
      <th style="padding:9px 12px;text-align:right;font-size:12px;color:#666;">Qty</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>

<div style="background:white;padding:20px 32px;border:1px solid #ddd;border-top:none;">
  <p style="font-size:14px;color:#555;line-height:1.6;margin:0;">
    Prices are re-checked against our current catalog when you open the link, so you always see the
    latest quote. Ready to order? Just submit the inquiry from your cart and we will send a formal PI.
  </p>
</div>

<div style="text-align:center;font-size:12px;color:#999;padding:16px;">
  Party Maker &middot; <a href="${SITE_ORIGIN}" style="color:${OLIVE};text-decoration:none;">partymaker.cn</a><br>
  info@partymaker.cn &middot; +86 21 61483626
</div>
</body></html>`;
}

function buildText(items, shareUrl) {
  const rows = items.map((it, i) => `${i + 1}. ${it.sku}  x ${it.qty}`).join('\n');
  const totalPcs = items.reduce((sum, it) => sum + it.qty, 0);
  return `YOUR SAVED LIST
${items.length} product${items.length > 1 ? 's' : ''} - ${totalPcs} pieces

Keep this email. Open the link below on any computer or phone and the products
you picked will be put back in your Inquiry Cart - no account, no password needed.

${shareUrl}

WHAT IS IN THIS LIST
${rows}

Prices are re-checked against our current catalog when you open the link.
Ready to order? Submit the inquiry from your cart and we will send a formal PI.

Party Maker - partymaker.cn
info@partymaker.cn | +86 21 61483626
`;
}

// ============================================================
// 工具函数
// ============================================================

/** 基本合规校验：非空、有 @、域名有点、无空白字符 */
function isValidEmail(email) {
  if (!email || email.length > 254) return false;
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(email);
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonResp(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
