/**
 * Cloudflare Pages Function - Inquiry Handler
 * Path: /api/inquiry
 * Sends email with Excel quote sheet via Resend
 */

// Import Excel builder
// We'll use a simplified approach - build CSV instead of complex XLSX
// CSV is more reliable and opens natively in Excel

async function generateExcelCsv(cart) {
  // CSV header
  let csv = '\uFEFF'; // BOM for UTF-8 Excel compatibility
  csv += 'SKU,Product Name,Quantity,Unit Price,Subtotal,Image URL\n';

  let total = 0;
  for (const item of cart) {
    const qty = parseInt(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    const subtotal = qty * price;
    total += subtotal;
    const sku = item.sku || '';
    const imgUrl = (item.images && item.images[0]) ? item.images[0] : '';
    // Escape CSV fields
    const name = `"${(item.name || '').replace(/"/g, '""')}"`;
    csv += `${sku},${name},${qty},${price.toFixed(2)},${subtotal.toFixed(2)},${imgUrl}\n`;
  }
  csv += `,,,,,\n`;
  csv += `TOTAL,,,,${total.toFixed(2)},`;

  return csv;
}

function buildEmailHtml(contact, cart) {
  const cartRows = cart.map(item => {
    const qty = parseInt(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    const subtotal = qty * price;
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(item.sku || '-')}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(item.name || '')}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${qty}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${price.toFixed(2)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">$${subtotal.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const total = cart.reduce((sum, item) => {
    return sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.price) || 0));
  }, 0);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;padding:24px;border-radius:12px 12px 0 0;">
    <h1 style="margin:0;font-size:1.5rem;">🎉 New Product Inquiry</h1>
    <p style="margin:8px 0 0;opacity:0.9;">From Party Maker Website</p>
  </div>
  <div style="background:#f8fafc;padding:20px 24px;border:1px solid #e5e7eb;border-top:none;">
    <h2 style="font-size:1rem;color:#1f2937;margin:0 0 12px;">Contact Information</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.9rem;">
      <div><strong>Name:</strong> ${escapeHtml(contact.name || '-')}</div>
      <div><strong>Email:</strong> <a href="mailto:${escapeHtml(contact.email || '')}" style="color:#2563eb;">${escapeHtml(contact.email || '-')}</a></div>
      <div><strong>Company:</strong> ${escapeHtml(contact.company || '-')}</div>
      <div><strong>Country:</strong> ${escapeHtml(contact.country || '-')}</div>
    </div>
    ${contact.message ? `<div style="margin-top:8px;font-size:0.9rem;"><strong>Message:</strong> ${escapeHtml(contact.message)}</div>` : ''}
  </div>
  <div style="padding:20px 24px;">
    <h2 style="font-size:1rem;color:#1f2937;margin:0 0 12px;">Selected Products (${cart.length} items)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;">SKU</th>
          <th style="padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;">Product Name</th>
          <th style="padding:8px;text-align:center;border-bottom:2px solid #e5e7eb;">Qty</th>
          <th style="padding:8px;text-align:right;border-bottom:2px solid #e5e7eb;">Unit Price</th>
          <th style="padding:8px;text-align:right;border-bottom:2px solid #e5e7eb;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${cartRows}
        <tr>
          <td colspan="4" style="padding:12px 8px;text-align:right;font-weight:700;font-size:1.1rem;">TOTAL:</td>
          <td style="padding:12px 8px;text-align:right;font-weight:700;font-size:1.1rem;color:#f97316;">$${total.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
    <p style="margin-top:16px;font-size:0.85rem;color:#6b7280;">
      <em>📎 A CSV quote sheet is attached to this email. Open it in Excel or any spreadsheet application.</em>
    </p>
  </div>
  <div style="background:#1f2937;color:#9ca3af;padding:16px 24px;border-radius:0 0 12px 12px;font-size:0.8rem;text-align:center;">
    <p style="margin:0;">Inquiries from Party Maker Website | ${new Date().toLocaleDateString()}</p>
  </div>
</body>
</html>`;
}

function buildEmailText(contact, cart) {
  const total = cart.reduce((sum, item) => {
    return sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.price) || 0));
  }, 0);

  const items = cart.map(item => {
    const qty = parseInt(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    const subtotal = qty * price;
    return `[${item.sku || '-'}] ${item.name}: ${qty} x $${price.toFixed(2)} = $${subtotal.toFixed(2)}`;
  }).join('\n');

  return `PARTY MAKER - NEW PRODUCT INQUIRY
================================

Contact:
- Name: ${contact.name || '-'}
- Email: ${contact.email || '-'}
- Company: ${contact.company || '-'}
- Country: ${contact.country || '-'}
- Message: ${contact.message || '-'}

Products (${cart.length} items):
${items}

----------------------------------
TOTAL: $${total.toFixed(2)}
----------------------------------

A CSV quote sheet is attached.

Submitted: ${new Date().toISOString()}`;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await context.request.json();
    const { contact, cart } = body;

    if (!contact || !contact.email || !contact.name) {
      return new Response(JSON.stringify({ error: 'Missing contact info (name, email required)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!cart || cart.length === 0) {
      return new Response(JSON.stringify({ error: 'Cart is empty' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendApiKey = context.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate CSV (more reliable than XLSX)
    const csvContent = await generateExcelCsv(cart);
    const csvBase64 = btoa(csvContent);

    const emailHtml = buildEmailHtml(contact, cart);
    const emailText = buildEmailText(contact, cart);

    // Send via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Party Maker <onboarding@resend.dev>',
        to: ['724097@qq.com'],
        subject: `📩 New Inquiry from ${contact.name} - ${cart.length} products`,
        html: emailHtml,
        text: emailText,
        attachments: [
          {
            filename: `Party-Maker-Inquiry-${Date.now()}.csv`,
            content: csvBase64,
          },
        ],
      }),
    });

    const result = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error('Resend error:', result);
      return new Response(JSON.stringify({ error: 'Failed to send email', detail: result.message || 'Unknown error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Inquiry sent successfully',
      emailId: result.id,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Handler error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', detail: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
