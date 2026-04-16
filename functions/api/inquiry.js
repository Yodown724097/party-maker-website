/**
 * Cloudflare Pages Function - Inquiry Handler (xlsx version)
 * Uses xlsx library for standard-compliant Excel generation
 * 
 * Dependencies: xlsx (installed via package.json)
 */

import * as XLSX from 'xlsx';

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.pathname !== '/api/inquiry') {
    return new Response('Not Found', { status: 404 });
  }

  let body;
  try { 
    body = await request.json(); 
  } catch(e) { 
    return new Response(JSON.stringify({error:'Invalid JSON'}), {
      status: 400, 
      headers: {'Content-Type':'application/json'}
    }); 
  }

  const { contact={}, cart=[] } = body;
  
  if (!contact.name || !contact.email || !cart || cart.length===0) {
    return new Response(JSON.stringify({error:'Missing required fields: name, email, cart'}), {
      status: 400, 
      headers: {'Content-Type':'application/json'}
    });
  }

  const resendKey = env.RESEND_API_KEY;
  if (!resendKey) {
    return new Response(JSON.stringify({error:'RESEND_API_KEY not configured'}), {
      status: 500, 
      headers: {'Content-Type':'application/json'}
    });
  }

  try {
    const result = await buildAndSend(resendKey, contact, cart);
    console.log('Email sent:', result.emailId);
    return new Response(JSON.stringify({success:true, ...result}), {
      headers: {'Content-Type':'application/json'}
    });
  } catch(e) {
    console.error('Inquiry error:', e.message, e.stack);
    return new Response(JSON.stringify({error: e.message || 'Internal error', stack: e.stack}), {
      status: 500, 
      headers: {'Content-Type':'application/json'}
    });
  }
}


function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


function buildXlsx(contact, cart) {
  const now = new Date();
  const piNo = 'PI-' + now.getFullYear().toString().slice(-2)
    + now.toISOString().slice(5,10).replace(/-/g,'') + '-'
    + String(Math.floor(Math.random()*9999)).padStart(4,'0');

  // Create workbook
  const wb = XLSX.utils.book_new();
  
  // Create worksheet data
  const wsData = [];
  
  // Title row
  wsData.push(['PROFORMA INVOICE', '', '', '', '', '', '', piNo]);
  
  // Empty row
  wsData.push(['']);
  
  // Contact info
  wsData.push(['TO:', contact.name || '', '', 'From:', 'PARTY MAKER']);
  wsData.push(['ATTN:', contact.name || '', '', 'Email:', contact.email || '']);
  wsData.push(['TEL:', contact.phone || '', '', 'Date:', now.toISOString().slice(0,10)]);
  wsData.push(['COMPANY:', contact.company || '', '', 'Port:', 'FOB Ningbo/Shanghai']);
  wsData.push(['REMARK:', contact.country || '']);
  
  // Empty row
  wsData.push(['']);
  
  // Table header
  wsData.push([
    { t: 's', v: 'No.' },
    { t: 's', v: 'Item No.' },
    { t: 's', v: 'Product Name' },
    { t: 's', v: 'Description' },
    { t: 's', v: 'USD Price' },
    { t: 's', v: 'Qty' },
    { t: 's', v: 'Amount' },
    { t: 's', v: 'Image URL' }
  ]);
  
  // Product rows
  let totalAmt = 0;
  cart.forEach((item, i) => {
    const qty = parseInt(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    const amt = qty * price;
    totalAmt += amt;
    const imgUrl = (item.images && item.images[0]) ? item.images[0] : '';
    
    wsData.push([
      i + 1,
      item.sku || '-',
      item.name || '',
      item.description || '',
      price,
      qty,
      amt,
      imgUrl
    ]);
  });
  
  // Total row
  wsData.push(['', '', '', '', '', 'TOTAL:', totalAmt]);
  
  // Empty row
  wsData.push(['']);
  
  // Terms & Conditions header
  wsData.push([{ t: 's', v: 'TERMS & CONDITIONS' }]);
  wsData.push([{ t: 's', v: '1. FOB Ningbo/Shanghai.' }]);
  wsData.push([{ t: 's', v: '2. The price does not include any testing, inspection and auditing costs.' }]);
  wsData.push([{ t: 's', v: '3. Production time: 45 days after deposit is received.' }]);
  wsData.push([{ t: 's', v: '4. Payment method: 30% deposit, 70% balance to be paid before goods leave factory.' }]);
  
  // Empty row
  wsData.push(['']);
  
  // Bank Information
  wsData.push([{ t: 's', v: 'Bank Information:' }]);
  wsData.push([{ t: 's', v: 'BENEFICIARY:' }, 'JIATAO INDUSTRY (SHANGHAI) CO.,LTD']);
  wsData.push([{ t: 's', v: 'BANK OF NAME:' }, 'AGRICULTURAL BANK OF CHINA SHANGHAI YANGPU BRANCH']);
  wsData.push([{ t: 's', v: 'BANK ADDRESS:' }, 'NO. 1128, XIANGYIN ROAD, YANGPU DISTRICT, SHANGHAI CHINA']);
  wsData.push([{ t: 's', v: 'POST CODE:' }, '200433']);
  wsData.push([{ t: 's', v: 'A/C NO.:' }, '09421014040006209']);
  wsData.push([{ t: 's', v: 'SWIFT CODE:' }, 'ABOCCNBJ090']);
  
  // Create worksheet from array
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 5 },   // A
    { wch: 12 },  // B
    { wch: 28 },  // C
    { wch: 35 },  // D
    { wch: 12 },  // E
    { wch: 8 },   // F
    { wch: 12 },  // G
    { wch: 50 },  // H
  ];
  
  // Add sheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'PI');
  
  // Generate XLSX as binary
  const xlsxBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  
  return { buffer: xlsxBuffer, piNo };
}


function buildEmailHtml(contact, cart) {
  const total = cart.reduce((sum, item) => sum + ((parseInt(item.quantity)||0)*(parseFloat(item.price)||0)), 0);
  const phoneRow = contact.phone ? `<div><strong>Phone:</strong> <a href="tel:${escapeHtml(contact.phone)}" style="color:#9CAF88;">${escapeHtml(contact.phone)}</a></div>` : '';

  const rows = cart.map((item, i) => {
    const qty = parseInt(item.quantity)||0;
    const price = parseFloat(item.price)||0;
    const subtotal = qty * price;
    const imgTag = (item.images && item.images[0])
      ? `<img src="${item.images[0]}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid #D9E0D1;"/>`
      : `<div style="width:64px;height:64px;background:#F7F9F5;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#8A9A7A;">No Img</div>`;
    return `<tr><td style="padding:10px 8px;border-bottom:1px solid #D9E0D1;text-align:center;font-size:13px;color:#7A8B6E;">${i+1}</td><td style="padding:10px 8px;border-bottom:1px solid #D9E0D1;font-size:12px;font-weight:600;color:#7A8B6E;">${escapeHtml(item.sku||'-')}</td><td style="padding:10px 8px;border-bottom:1px solid #D9E0D1;text-align:center;">${imgTag}</td><td style="padding:10px 8px;border-bottom:1px solid #D9E0D1;font-size:13px;">${escapeHtml(item.name||'')}</td><td style="padding:10px 8px;border-bottom:1px solid #D9E0D1;text-align:center;font-size:13px;">${qty}</td><td style="padding:10px 8px;border-bottom:1px solid #D9E0D1;text-align:right;font-size:13px;">$${price.toFixed(2)}</td><td style="padding:10px 8px;border-bottom:1px solid #D9E0D1;text-align:right;font-size:13px;font-weight:700;color:#7A8B6E;">$${subtotal.toFixed(2)}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:20px;background:#F7F9F5;"><div style="background:#9CAF88;color:white;padding:28px 24px;border-radius:12px 12px 0 0;"><h1 style="margin:0;font-size:1.5rem;font-weight:700;">New Product Inquiry</h1><p style="margin:6px 0 0;opacity:0.9;font-size:0.9rem;">From Party Maker Website</p></div><div style="background:white;padding:20px 24px;border:1px solid #D9E0D1;border-top:none;"><h2 style="font-size:0.9rem;color:#7A8B6E;margin:0 0 12px;font-weight:600;border-bottom:1px solid #D9E0D1;padding-bottom:8px;">Contact Information</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.88rem;color:#333;"><div><strong>Name:</strong> ${escapeHtml(contact.name||'-')}</div><div><strong>Email:</strong> <a href="mailto:${escapeHtml(contact.email||'')}" style="color:#9CAF88;">${escapeHtml(contact.email||'-')}</a></div><div><strong>Company:</strong> ${escapeHtml(contact.company||'-')}</div><div><strong>Country:</strong> ${escapeHtml(contact.country||'-')}</div>${phoneRow}</div>${contact.message ? `<div style="margin-top:12px;font-size:0.88rem;color:#333;background:#F7F9F5;padding:10px;border-radius:6px;"><strong>Message:</strong> ${escapeHtml(contact.message)}</div>` : ''}</div><div style="background:white;padding:20px 24px;border:1px solid #D9E0D1;border-top:none;border-radius:0 0 12px 12px;margin-bottom:20px;"><h2 style="font-size:0.9rem;color:#7A8B6E;margin:0 0 12px;font-weight:600;">Selected Products (${cart.length} items)</h2><table style="width:100%;border-collapse:collapse;font-size:0.88rem;background:white;border:1px solid #D9E0D1;border-radius:8px;overflow:hidden;"><thead><tr style="background:#9CAF88;color:white;"><th style="padding:10px 8px;text-align:center;">#</th><th style="padding:10px 8px;text-align:center;">SKU</th><th style="padding:10px 8px;text-align:center;">Image</th><th style="padding:10px 8px;text-align:left;">Product</th><th style="padding:10px 8px;text-align:center;">Qty</th><th style="padding:10px 8px;text-align:right;">Price</th><th style="padding:10px 8px;text-align:right;">Subtotal</th></tr></thead><tbody>${rows}</tbody><tfoot><tr style="background:#F7F9F5;"><td colspan="5" style="padding:10px 8px;"></td><td style="padding:10px 8px;text-align:right;font-weight:700;color:#7A8B6E;">TOTAL:</td><td style="padding:10px 8px;text-align:right;font-weight:700;color:#7A8B6E;">$${total.toFixed(2)}</td></tr></tfoot></table><p style="font-size:0.78rem;color:#8A9A7A;margin:12px 0 0;">* An Excel PI sheet is attached to this email for your reference.</p></div><div style="text-align:center;font-size:0.75rem;color:#8A9A7A;margin-top:16px;">Sent via <a href="https://party-maker-website.pages.dev" style="color:#9CAF88;">Party Maker Website</a></div></body></html>`;
}


// Base64 encode (RFC 4648 standard alphabet)
function b64Encode(data) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let result = '';
  let i = 0;
  const len = bytes.length;

  while (i < len) {
    const b1 = bytes[i++];
    const b2 = i < len ? bytes[i++] : 0;
    const b3 = i < len ? bytes[i++] : 0;
    result += chars[b1 >> 2];
    result += chars[((b1 & 3) << 4) | (b2 >> 4)];
    result += (i - 1 < len) ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    result += (i < len) ? chars[b3 & 63] : '=';
  }
  return result;
}


async function buildAndSend(resendKey, contact, cart) {
  const { buffer, piNo } = buildXlsx(contact, cart);
  const html = buildEmailHtml(contact, cart);

  const xlsxBytes = new Uint8Array(buffer);
  const xlsxB64 = b64Encode(xlsxBytes);

  const payload = {
    from: 'Party Maker <onboarding@resend.dev>',
    to: ['724097@qq.com'],
    subject: `New Inquiry from ${contact.name} - ${piNo}`,
    html: html,
    attachments: [{
      filename: `${piNo}.xlsx`,
      content: xlsxB64,
    }],
  };

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resendRes.ok) {
    const err = await resendRes.text();
    throw new Error(`Resend error: ${err}`);
  }

  const result = await resendRes.json();
  return { emailId: result.id, piNo };
}
