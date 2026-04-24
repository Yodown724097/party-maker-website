/**
 * Cloudflare Pages Function - Inquiry Email Handler
 * 用 Resend API 直接发送询盘邮件，无需 VPS 中转
 *
 * 流程:
 *   1. 接收前端 POST 请求（contact + cart）
 *   2. 生成 PI 号
 *   3. 用 Resend 发客户通知邮件（HTML，无附件，无成本价）
 *   4. 用 Resend 发内部邮件给 info@（HTML + CSV 附件，含成本价）
 */
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

  try {
    const body = await request.json();
    const { contact, cart, send_email = true } = body;

    if (!contact?.name || !contact?.email) {
      return jsonResp({ error: 'Missing name/email' }, 400, corsHeaders);
    }
    if (!cart || cart.length === 0) {
      return jsonResp({ error: 'Cart is empty' }, 400, corsHeaders);
    }

    // 生成 PI 号
    const now = new Date();
    const piNo = `PI-${String(now.getFullYear()).slice(-2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Math.floor(Math.random()*9000+1000)}`;
    const total = cart.reduce((sum, item) => {
      return sum + (parseInt(item.quantity || 0) * parseFloat(item.price || 0));
    }, 0);

    const results = {};

    if (send_email) {
      const apiKey = env.RESEND_API_KEY;
      if (!apiKey) {
        return jsonResp({ error: 'RESEND_API_KEY not configured' }, 500, corsHeaders);
      }

      // ===== 1. 客户通知邮件 =====
      const customerHtml = buildCustomerHtml(contact, cart, piNo, now, total);
      const customerText = buildCustomerText(contact, cart, piNo, total);

      try {
        const r1 = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Party Maker <info@partymaker.cn>',
            to: [contact.email],
            subject: `Inquiry Received - ${piNo}`,
            text: customerText,
            html: customerHtml,
          }),
        });
        const d1 = await r1.json();
        results.customer_email = r1.ok ? { sent: true, id: d1.id } : { sent: false, error: d1 };
      } catch (e) {
        results.customer_email = { sent: false, error: e.message };
      }

      // ===== 2. 内部邮件（HTML + CSV 附件） =====
      const ownerHtml = buildOwnerHtml(contact, cart, piNo, now, total);
      const csvContent = buildCsv(contact, cart, piNo, total);
      // Base64 encode CSV
      const csvBase64 = typeof btoa === 'function'
        ? btoa(unescape(encodeURIComponent(csvContent)))
        : Buffer.from(csvContent, 'utf-8').toString('base64');

      try {
        const r2 = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Party Maker <info@partymaker.cn>',
            to: ['info@partymaker.cn'],
            subject: `[New Inquiry] ${piNo} - ${contact.name} (${contact.email})`,
            html: ownerHtml,
            attachments: [{
              filename: `${piNo}.csv`,
              content: csvBase64,
            }],
          }),
        });
        const d2 = await r2.json();
        results.owner_email = r2.ok ? { sent: true, id: d2.id } : { sent: false, error: d2 };
      } catch (e) {
        results.owner_email = { sent: false, error: e.message };
      }
    }

    return jsonResp({ success: true, piNo, results }, 200, corsHeaders);

  } catch (err) {
    return jsonResp({ success: false, error: err.message || 'Internal error' }, 500, corsHeaders);
  }
}

// ============================================================
// 客户邮件模板（无成本价）
// ============================================================

function buildCustomerHtml(contact, cart, piNo, now, total) {
  let rows = '';
  cart.forEach((item, i) => {
    const qty = parseInt(item.quantity || 0);
    const price = parseFloat(item.price || 0);
    const subtotal = qty * price;
    const sku = item.sku || item.id || '-';
    const name = item.name || '';
    const img = (Array.isArray(item.images) && item.images[0]) ? item.images[0] : '';
    rows += `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-size:13px;">${i+1}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-size:13px;font-weight:bold;">${esc(sku)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;">${esc(name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-size:13px;">${qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-size:13px;">$${price.toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-size:13px;font-weight:bold;">$${subtotal.toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-size:13px;">${img ? `<a href="${esc(img)}" style="color:#0563C1;">View</a>` : '-'}</td>
    </tr>`;
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:0;background:#f5f5f5;">
<div style="background:#9CAF88;color:white;padding:28px 32px;border-radius:12px 12px 0 0;">
  <h1 style="margin:0;font-size:22px;">Inquiry Received</h1>
  <p style="margin:8px 0 0;opacity:0.9;font-size:14px;">Reference: ${esc(piNo)} | ${now.toISOString().replace('T',' ').slice(0,16)}</p>
</div>
<div style="background:white;padding:24px 32px;border:1px solid #ddd;border-top:none;">
  <p style="font-size:15px;color:#333;">Dear <strong>${esc(contact.name || '')}</strong>,</p>
  <p style="font-size:14px;color:#555;line-height:1.6;">Thank you for your inquiry! We have received your request and will get back to you shortly with a formal <strong>Proforma Invoice (PI)</strong>.</p>
</div>
<div style="background:white;padding:0 32px 24px;border:1px solid #ddd;border-top:none;">
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr style="background:#9CAF88;color:white;">
      <th style="padding:10px 12px;text-align:center;">#</th>
      <th style="padding:10px 12px;text-align:center;">SKU</th>
      <th style="padding:10px 12px;text-align:left;">Product</th>
      <th style="padding:10px 12px;text-align:center;">Qty</th>
      <th style="padding:10px 12px;text-align:right;">Price</th>
      <th style="padding:10px 12px;text-align:right;">Subtotal</th>
      <th style="padding:10px 12px;text-align:center;">Image</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:#F7F9F5;">
      <td colspan="5"></td>
      <td style="padding:10px 12px;text-align:right;font-weight:bold;font-size:15px;">$${total.toFixed(2)}</td>
      <td></td>
    </tr></tfoot>
  </table>
</div>
<div style="background:white;padding:20px 32px;border:1px solid #ddd;border-top:none;">
  <p style="font-size:14px;color:#555;line-height:1.6;">We will send you the formal PI via email within <strong>24 hours</strong>.</p>
  <p style="font-size:14px;color:#555;">If you have any questions, feel free to reply to this email.</p>
</div>
<div style="text-align:center;font-size:12px;color:#999;padding:16px;">Sent by <a href="https://partymaker.cn" style="color:#9CAF88;">Party Maker</a></div>
</body></html>`;
}

function buildCustomerText(contact, cart, piNo, total) {
  let rows = '';
  cart.forEach((item, i) => {
    const qty = parseInt(item.quantity || 0);
    const price = parseFloat(item.price || 0);
    const sku = item.sku || item.id || '-';
    const name = item.name || '';
    rows += `${i+1}. ${sku} | ${name} | Qty: ${qty} | $${price.toFixed(2)} | Subtotal: $${(qty*price).toFixed(2)}\n`;
  });
  return `Dear ${contact.name || 'Valued Customer'},\n\nThank you for your inquiry!\n\nReference: ${piNo}\n\n${rows}\nTOTAL: $${total.toFixed(2)}\n\nOur team will prepare a formal PI and send it to you via email.\n\nBest regards,\nPARTY MAKER\ninfo@partymaker.cn`;
}

// ============================================================
// 内部邮件模板（含成本价）
// ============================================================

function buildOwnerHtml(contact, cart, piNo, now, total) {
  let rows = '';
  cart.forEach((item, i) => {
    const qty = parseInt(item.quantity || 0);
    const price = parseFloat(item.price || 0);
    const costPrice = parseFloat(item._costPrice || 0);
    const subtotal = qty * price;
    const sku = item.sku || item.id || '-';
    const name = item.name || '';
    const unitSize = item._unitSize || '-';
    rows += `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">${i+1}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;">${esc(sku)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(name)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">${qty}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">$${price.toFixed(2)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;">$${subtotal.toFixed(2)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;color:#c00;">${costPrice > 0 ? 'CNY ' + costPrice.toFixed(2) : '-'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">${esc(unitSize)}</td>
    </tr>`;
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:0;background:#f5f5f5;">
<div style="background:#2c3e50;color:white;padding:24px 32px;border-radius:12px 12px 0 0;">
  <h1 style="margin:0;font-size:20px;">New Inquiry Received</h1>
  <p style="margin:6px 0 0;opacity:0.85;font-size:13px;">${esc(piNo)} | ${now.toISOString().replace('T',' ').slice(0,16)}</p>
</div>
<div style="background:white;padding:20px 32px;border:1px solid #ddd;border-top:none;">
  <h3 style="margin:0 0 12px;color:#333;">Customer Info</h3>
  <table style="font-size:14px;color:#555;line-height:1.8;">
    <tr><td style="padding-right:16px;font-weight:bold;white-space:nowrap;">Name:</td><td>${esc(contact.name || '-')}</td></tr>
    <tr><td style="font-weight:bold;">Email:</td><td><a href="mailto:${esc(contact.email || '')}">${esc(contact.email || '-')}</a></td></tr>
    <tr><td style="font-weight:bold;">Company:</td><td>${esc(contact.company || '-')}</td></tr>
    <tr><td style="font-weight:bold;">Phone:</td><td>${esc(contact.phone || '-')}</td></tr>
    <tr><td style="font-weight:bold;">Country:</td><td>${esc(contact.country || '-')}</td></tr>
    <tr><td style="font-weight:bold;">Message:</td><td>${esc(contact.message || '-')}</td></tr>
  </table>
</div>
<div style="background:white;padding:0 32px 20px;border:1px solid #ddd;border-top:none;">
  <h3 style="margin:0 0 8px;color:#333;">Products (${cart.length} items)</h3>
  <table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr style="background:#2c3e50;color:white;">
      <th style="padding:8px 10px;text-align:center;">#</th>
      <th style="padding:8px 10px;text-align:center;">SKU</th>
      <th style="padding:8px 10px;text-align:left;">Product</th>
      <th style="padding:8px 10px;text-align:center;">Qty</th>
      <th style="padding:8px 10px;text-align:right;">USD</th>
      <th style="padding:8px 10px;text-align:right;">Amount</th>
      <th style="padding:8px 10px;text-align:right;">Cost(CNY)</th>
      <th style="padding:8px 10px;text-align:center;">Unit Size</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:#f7f9f5;">
      <td colspan="5"></td>
      <td style="padding:8px 10px;text-align:right;font-weight:bold;font-size:14px;">$${total.toFixed(2)}</td>
      <td colspan="2"></td>
    </tr></tfoot>
  </table>
</div>
<div style="text-align:center;font-size:11px;color:#999;padding:12px;">Auto-generated by Party Maker Website</div>
</body></html>`;
}

// ============================================================
// CSV 附件生成（含成本价，可直接用 Excel 打开）
// ============================================================

function buildCsv(contact, cart, piNo, total) {
  const lines = [];
  lines.push(`PROFORMA INVOICE,,,,,,,`);
  lines.push(`PI No.,${piNo},,,,,,,`);
  lines.push(`Date,${new Date().toISOString().slice(0,10)},,,,,,,`);
  lines.push('');
  lines.push(`TO: ${contact.company || '-'},,,,,,,`);
  lines.push(`ATTN: ${contact.name || '-'},,,,,,,`);
  lines.push(`Email: ${contact.email || '-'},,,,,,,`);
  lines.push(`Phone: ${contact.phone || '-'},,,,,,,`);
  lines.push(`Country: ${contact.country || '-'},,,,,,,`);
  lines.push(`Message: ${(contact.message || '').replace(/,/g, ';')},,,,,,,`);
  lines.push('');
  lines.push('No.,SKU,Product Name,USD Price,Qty,Amount,Cost(CNY),Unit Size');

  cart.forEach((item, i) => {
    const qty = parseInt(item.quantity || 0);
    const price = parseFloat(item.price || 0);
    const costPrice = parseFloat(item._costPrice || 0);
    const sku = item.sku || item.id || '-';
    const name = (item.name || '').replace(/,/g, ';');
    const unitSize = (item._unitSize || '-').replace(/,/g, ';');
    lines.push(`${i+1},"${sku}","${name}",${price},${qty},${(qty*price).toFixed(2)},${costPrice > 0 ? costPrice.toFixed(2) : ''},${unitSize}`);
  });

  lines.push('');
  lines.push(`TOTAL,,,,,${total.toFixed(2)},,`);
  lines.push('');
  lines.push('TERMS & CONDITIONS');
  lines.push('1. FOB Ningbo / Shanghai');
  lines.push('2. Price does not include testing, inspection and auditing costs');
  lines.push('3. Production time: 45 days after deposit is received');
  lines.push('4. Payment: 30% deposit, 70% balance before goods leave factory');
  lines.push('');
  lines.push('BANK INFORMATION');
  lines.push('BENEFICIARY:,JIATAO INDUSTRY (SHANGHAI) CO.,LTD');
  lines.push('BANK NAME:,AGRICULTURAL BANK OF CHINA SHANGHAI YANGPU BRANCH');
  lines.push('BANK ADDRESS:,NO.1128, XIANGYIN ROAD, YANGPU DISTRICT, SHANGHAI CHINA');
  lines.push('A/C NO.:,09421014040006209');
  lines.push('SWIFT CODE:,ABOCCNBJ090');

  return lines.join('\n');
}

// ============================================================
// 工具函数
// ============================================================

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function jsonResp(data, status, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}
