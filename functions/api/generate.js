/**
 * Cloudflare Pages Function - Inquiry Email Handler
 * 用 Resend API 直接发送询盘邮件，无需 VPS 中转
 *
 * 流程:
 *   1. 接收前端 POST 请求（contact + cart）
 *   2. 生成 PI 号
 *   3. 用 Resend 发客户通知邮件（HTML，无附件，无成本价）
 *   4. 用 Resend 发内部邮件给 info@（HTML + Excel 附件，含成本价）
 */
import { PRODUCT_INTERNAL } from '../_shared/product-data.js';

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

      // ===== 2. 内部邮件（HTML + Excel 附件） =====
      const ownerHtml = buildOwnerHtml(contact, cart, piNo, now, total);
      const xlsxBase64 = generateXlsxBase64(contact, cart, piNo, now, total);

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
              filename: `${piNo}.xlsx`,
              content: xlsxBase64,
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
    const costPrice = parseFloat((PRODUCT_INTERNAL[item.sku || item.id] || {})._costPrice || 0);
    const subtotal = qty * price;
    const sku = item.sku || item.id || '-';
    const name = item.name || '';
    const unitSize = (PRODUCT_INTERNAL[sku] || {})._unitSize || '-';
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
// Excel (XLSX) 生成 — 纯 JS 实现（OOXML ZIP 格式）
// 完全匹配参考PI模板排版：表头布局、合并单元格、样式、列宽行高
// ============================================================

function generateXlsxBase64(contact, cart, piNo, now, total) {
  const strings = [];
  const stringIdx = {};

  function addString(s) {
    const str = String(s == null ? '' : s);
    if (str in stringIdx) return stringIdx[str];
    const idx = strings.length;
    strings.push(str);
    stringIdx[str] = idx;
    return idx;
  }

  // 单元格数据格式: [cellRef, value, valueType, styleName]
  // valueType: 'n'=number, 's'=shared string index, 'f'=formula, 'e'=empty
  // styleName: mapped to cellXf index in styles.xml

  // 列标题（A-T，20列）
  const headers = [
    'No.','Item No.','Image','Product Name','Description',
    'Price','Qty','Amount',
    '成本价','成本备注','下载单号','Stock Qty',
    'Unit Size','CTN L','CTN W','CTN H','pcs/CTN','CBM','N.W','G.W'
  ];
  const headerIdx = headers.map(addString);

  // 构建行数据
  const rows = [];

  // ---- Row 1: PROFORMA INVOICE (merged A1:H1) ----
  rows.push([['A1', addString('PROFORMA INVOICE'), 's', 'title']]);

  // ---- Row 2: BUYER INFO + PI No. ----
  rows.push([
    ['A2', addString('BUYER INFO:'), 's', 'label'],
    ['F2', addString('NO.:'), 's', 'label'],
    ['G2', addString(piNo), 's', 'normal'],
  ]);

  // ---- Row 3-6: Contact info (left: A label + B value, right: F label + G value) ----
  const dateStr = now.toISOString().slice(0,10);
  const infoRows = [
    [['A3','TO:'], ['B3',''], ['F3','From:'], ['G3','PARTY MAKER']],
    [['A4','ATTN:'], ['B4', contact.name || ''], ['F4','Email:'], ['G4','service@partymaker.cn']],
    [['A5','TEL:'], ['B5', contact.phone || ''], ['F5','Date:'], ['G5', dateStr]],
    [['A6','Addr:'], ['B6', contact.country || ''], ['F6','Port:'], ['G6','FOB Ningbo/Shanghai']],
  ];
  infoRows.forEach(infoRow => {
    const row = [];
    infoRow.forEach(([ref, val]) => {
      // A/F columns are labels, B/G columns are values
      const colLetter = ref.replace(/[0-9]/g, '');
      const isLabel = (colLetter === 'A' || colLetter === 'F');
      row.push([ref, addString(val), 's', isLabel ? 'label' : 'normal']);
    });
    rows.push(row);
  });

  // ---- Row 7: separator (thin row) ----
  rows.push([]);

  // ---- Row 8: Table headers (A-T, green fill, white bold, thin borders) ----
  const headerRow = [];
  for (let c = 0; c < headers.length; c++) {
    const colL = c < 26 ? String.fromCharCode(65 + c) : 'A' + String.fromCharCode(65 + c - 26);
    headerRow.push([`${colL}8`, headerIdx[c], 's', 'header']);
  }
  rows.push(headerRow);

  // ---- Product rows (row 9+) ----
  const dataStartRow = 9;
  let rowNum = dataStartRow;
  cart.forEach((item, i) => {
    const qty = parseInt(item.quantity || 0) || 120;
    const price = parseFloat(item.price || 0);
    const sku = item.sku || item.id || '-';
    const name = item.name || '';
    const desc = (item.description || '').replace(/\n/g, ' ');
    const images = Array.isArray(item.images) ? item.images : [];
    const imgUrl = images[0] || '';

    // 从内嵌数据查找真实后台字段（前端products-public.json不含_字段）
    const internal = PRODUCT_INTERNAL[sku] || {};
    const costPrice = parseFloat(internal._costPrice || 0);

    // Helper: get internal field from embedded data, return '' if no real data
    const getVal = (key, dashIfEmpty) => {
      const v = internal[key];
      if (v == null || v === '' || v === 'nan' || v === 'None' || v === 'NaN') return dashIfEmpty ? '-' : '';
      if (v === '-') return '-';
      if (typeof v === 'number') return v;  // 0 is a valid number
      return v;
    };

    const costNote = getVal('_costNote');
    const orderNo = getVal('_orderNo');
    const stockQty = getVal('_stockQty', true);
    const unitSize = getVal('_unitSize');
    const ctnL = getVal('_ctnL', true);
    const ctnW = getVal('_ctnW', true);
    const ctnH = getVal('_ctnH', true);
    const pcsPerCtn = getVal('_pcsPerCtn', true);
    const cbm = getVal('_cbm', true);
    const nw = getVal('_nw', true);
    const gw = getVal('_gw', true);

    // Helper: add a cell — string value → 's', numeric → 'n', empty → empty cell with style
    const strCell = (ref, val, style) => val ? [ref, addString(String(val)), 's', style] : [ref, '', 'e', style];
    const numCell = (ref, val, style) => (val !== '' && val != null && !isNaN(val) && val !== '-') ? [ref, Number(val), 'n', style] : strCell(ref, val, style);

    const row = [
      [`A${rowNum}`, i + 1, 'n', 'data'],                                          // No.
      [`B${rowNum}`, addString(sku), 's', 'dataC'],                                 // Item No.
      imgUrl ? [`C${rowNum}`, addString(imgUrl), 's', 'dataC'] : [`C${rowNum}`, '', 'e', 'dataC'], // Image (URL)
      [`D${rowNum}`, addString(name), 's', 'dataL'],                                // Product Name
      [`E${rowNum}`, addString(desc), 's', 'dataL'],                                // Description
      [`F${rowNum}`, price, 'n', 'price'],                                          // Price ($ format)
      [`G${rowNum}`, qty, 'n', 'dataC'],                                            // Qty
      [`H${rowNum}`, `F${rowNum}*G${rowNum}`, 'f', 'formula'],                      // Amount (formula $ format)
      [`I${rowNum}`, costPrice > 0 ? costPrice : '', costPrice > 0 ? 'n' : 'e', 'costPrice'], // 成本价 (¥ format)
      strCell(`J${rowNum}`, costNote, 'dataC'),                                     // 成本备注
      strCell(`K${rowNum}`, orderNo, 'dataC'),                                      // 下载单号
      strCell(`L${rowNum}`, stockQty, 'dataC'),                                     // Stock Qty
      strCell(`M${rowNum}`, unitSize, 'dataC'),                                     // Unit Size
      strCell(`N${rowNum}`, ctnL, 'dataC'),                                         // CTN L
      strCell(`O${rowNum}`, ctnW, 'dataC'),                                         // CTN W
      strCell(`P${rowNum}`, ctnH, 'dataC'),                                         // CTN H
      strCell(`Q${rowNum}`, pcsPerCtn, 'dataC'),                                    // pcs/CTN
      strCell(`R${rowNum}`, cbm, 'dataCbm'),                                        // CBM (0.000 format)
      strCell(`S${rowNum}`, nw, 'dataCbm'),                                         // N.W (0.000 format)
      strCell(`T${rowNum}`, gw, 'dataCbm'),                                         // G.W (0.000 format)
    ];

    rows.push(row);
    rowNum++;
  });

  // ---- Total row (with B-G empty cells for full border on merged range) ----
  const totalRow = rowNum;
  rows.push([
    [`A${totalRow}`, addString('TOTAL:'), 's', 'totalLabel'],
    [`B${totalRow}`, '', 'e', 'totalLabel'],
    [`C${totalRow}`, '', 'e', 'totalLabel'],
    [`D${totalRow}`, '', 'e', 'totalLabel'],
    [`E${totalRow}`, '', 'e', 'totalLabel'],
    [`F${totalRow}`, '', 'e', 'totalLabel'],
    [`G${totalRow}`, '', 'e', 'totalLabel'],
    [`H${totalRow}`, `SUM(H${dataStartRow}:H${totalRow - 1})`, 'f', 'totalFormula'],
  ]);
  rowNum = totalRow + 2;

  // ---- Terms & Conditions ----
  const termsRow = rowNum;
  rows.push([[`A${rowNum}`, addString('TERMS & CONDITIONS'), 's', 'section']]);
  rowNum++;
  const terms = [
    '1. FOB Ningbo/Shanghai',
    '2. Price does not include testing, inspection and auditing costs',
    '3. Production time: 45 days after deposit received',
    '4. Payment: 30% deposit, 70% balance before shipment',
  ];
  terms.forEach(t => {
    rows.push([[`A${rowNum}`, addString(t), 's', 'normal']]);
    rowNum++;
  });

  // ---- Bank Information ----
  rowNum++;
  const bankStartRow = rowNum;
  rows.push([[`A${rowNum}`, addString('BANK INFORMATION'), 's', 'section']]);
  rowNum++;
  const bankInfo = [
    ['BENEFICIARY:', 'JIATAO INDUSTRY (SHANGHAI) CO.,LTD'],
    ['BANK:', 'AGRICULTURAL BANK OF CHINA SHANGHAI YANGPU BRANCH'],
    ['ADDRESS:', 'NO. 1128, XIANGYIN ROAD, YANGPU DISTRICT, SHANGHAI'],
    ['POST CODE:', '200433'],
    ['A/C NO.:', '09421014040006209'],
    ['SWIFT:', 'ABOCCNBJ090'],
  ];
  bankInfo.forEach(([label, val]) => {
    rows.push([
      [`B${rowNum}`, addString(label), 's', 'bankLabel'],
      [`C${rowNum}`, addString(val), 's', 'bankValue'],
    ]);
    rowNum++;
  });

  const xlsx = buildXlsx(strings, rows, cart.length, totalRow, dataStartRow, termsRow, bankStartRow);
  return btoa(xlsx);
}

function buildXlsx(strings, rows, productCount, totalRow, dataStartRow, termsRow, bankStartRow) {
  // Shared strings XML
  let ssXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  ssXml += '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + strings.length + '" uniqueCount="' + strings.length + '">';
  strings.forEach(s => {
    ssXml += '<si><t>' + escapeXml(String(s)) + '</t></si>';
  });
  ssXml += '</sst>';

  // Column widths (A-T) — A加宽容纳BENEFICIARY等标签
  const widths = [14, 14, 9.4, 28.3, 25, 11.7, 10.4, 12, 10, 8, 10, 13, 13, 8, 13, 13, 13, 13, 13, 13];
  let colsXml = '<cols>';
  widths.forEach((w, i) => {
    colsXml += '<col min="' + (i+1) + '" max="' + (i+1) + '" width="' + w + '" customWidth="1"/>';
  });
  colsXml += '</cols>';

  // Build worksheet XML
  let wsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  wsXml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
  wsXml += colsXml;

  // Row heights
  wsXml += '<sheetFormatPr defaultRowHeight="15"/>';
  // Custom row heights
  const rowHeights = {};
  rowHeights[1] = 36;
  for (let r = 3; r <= 6; r++) rowHeights[r] = 18;
  rowHeights[7] = 4; // separator
  rowHeights[8] = 22; // header
  for (let r = dataStartRow; r < dataStartRow + productCount; r++) rowHeights[r] = 65;
  rowHeights[totalRow] = 25;
  if (termsRow) rowHeights[termsRow] = 20;
  for (let r = bankStartRow || 0; r < (bankStartRow || 0) + 7; r++) rowHeights[r] = 18;

  wsXml += '<sheetData>';

  const styleMap = {
    'title': 2,
    'label': 3,
    'normal': 0,
    'header': 1,
    'data': 4,
    'dataC': 4,
    'dataL': 5,
    'dataR': 6,
    'price': 12,
    'formula': 13,
    'costPrice': 14,
    'dataCbm': 15,
    'totalLabel': 7,
    'totalFormula': 8,
    'section': 9,
    'bankLabel': 10,
    'bankValue': 11,
  };

  rows.forEach(rowData => {
    if (!rowData || rowData.length === 0) {
      // Empty row (separator)
      const row7 = 7;
      wsXml += '<row r="' + row7 + '" ht="4" customHeight="1"/>';
      return;
    }
    const firstCell = rowData[0][0];
    const rowNum = parseInt(firstCell.replace(/[A-Z]/g, ''));
    let rowAttr = ' r="' + rowNum + '"';
    if (rowHeights[rowNum]) {
      rowAttr += ' ht="' + rowHeights[rowNum] + '" customHeight="1"';
    }
    wsXml += '<row' + rowAttr + '>';

    rowData.forEach(([cellRef, value, valueType, styleName]) => {
      const sIdx = styleMap[styleName] || 0;
      wsXml += '<c r="' + cellRef + '"' + (sIdx > 0 ? ' s="' + sIdx + '"' : '');

      if (valueType === 'f') {
        // Formula
        wsXml += '>';
        wsXml += '<f>' + escapeXml(String(value)) + '</f>';
        wsXml += '</c>';
      } else if (valueType === 'n') {
        // Number value
        wsXml += '>';
        wsXml += '<v>' + value + '</v>';
        wsXml += '</c>';
      } else if (valueType === 's') {
        // Shared string index
        wsXml += ' t="s">';
        wsXml += '<v>' + value + '</v>';
        wsXml += '</c>';
      } else {
        // Empty cell
        wsXml += '></c>';
      }
    });

    wsXml += '</row>';
  });

  wsXml += '</sheetData>';

  // Merge cells (matching reference Excel)
  const fixedMergeCount = 3; // A1:H1, A2:D2, TOTAL row
  wsXml += '<mergeCells count="' + fixedMergeCount + '">';
  wsXml += '<mergeCell ref="A1:H1"/>';     // Title
  wsXml += '<mergeCell ref="A2:D2"/>';     // BUYER INFO
  wsXml += '<mergeCell ref="A' + totalRow + ':G' + totalRow + '"/>'; // TOTAL row
  // Bank merges: C:F for bank value rows
  let bankMergeCount = 0;
  let bankMergeXml = '';
  for (let ri = 0; ri < rows.length; ri++) {
    const rd = rows[ri];
    if (!rd || !rd[0]) continue;
    const first = rd[0];
    if (!Array.isArray(first) || first.length < 4) continue;
    if (first[3] === 'bankLabel') {
      const r = parseInt(String(first[0]).replace(/[A-Z]/g, ''));
      bankMergeXml += '<mergeCell ref="C' + r + ':F' + r + '"/>';
      bankMergeCount++;
    }
  }
  // Update merge count
  const totalMergeCount = fixedMergeCount + bankMergeCount;
  wsXml = wsXml.replace('<mergeCells count="' + fixedMergeCount + '">', '<mergeCells count="' + totalMergeCount + '">');
  wsXml += bankMergeXml;
  wsXml += '</mergeCells>';

  wsXml += '</worksheet>';

  return buildXlsxZip(ssXml, wsXml);
}

function buildXlsxZip(ssXml, wsXml) {
  // Styles XML — 完整样式匹配参考PI模板
  // 字体: 0=default 10pt, 1=bold white 10pt(header), 2=bold 14pt(title),
  //       3=bold 11pt(labels), 4=11pt(bank values), 5=bold 11pt(section),
  //       6=bold red 11pt(cost label), 7=bold 10pt(green label)
  // 填充: 0=none, 1=gray125(必需), 2=green #9CAF88, 3=light #F7F9F5,
  //        4=light yellow #FFF8E1(备用)
  // 边框: 0=none, 1=thin black
  // cellXf索引:
  //  0: default (10pt, no border)
  //  1: header (green fill, white bold 10pt, center, thin border, wrap)
  //  2: title (green fill, bold 14pt, center)
  //  3: bold label (bold 11pt, left)
  //  4: data center (thin border, center, wrap)
  //  5: data left (thin border, left, wrap)
  //  6: data right (thin border, right)
  //  7: total label (bold 11pt, fill #F7F9F5, thin border, right)
  //  8: total formula (bold 11pt, fill #F7F9F5, thin border, right, $#,##0.00)
  //  9: section header (bold 11pt, left)
  //  10: bank label (bold 11pt, left)
  //  11: bank value (11pt, left)
  //  12: price (thin border, right, $#,##0.00)
  //  13: amount formula (thin border, right, $#,##0.00)
  //  14: cost price (thin border, right, ¥#,##0.00, red font)
  //  15: CBM/NW/GW (thin border, center, 0.000)
  const stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3">' +
    '<numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/>' +
    '<numFmt numFmtId="165" formatCode="&quot;¥&quot;#,##0.00"/>' +
    '<numFmt numFmtId="166" formatCode="0.000"/>' +
    '</numFmts>' +
    '<fonts count="8">' +
    '<font><sz val="10"/><name val="Arial"/></font>' +                                                        // 0: default 10pt
    '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>' +                             // 1: bold white 10pt (header)
    '<font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>' +                             // 2: bold white 14pt (title)
    '<font><b/><sz val="11"/><name val="Arial"/></font>' +                                                    // 3: bold 11pt (labels)
    '<font><sz val="11"/><name val="Arial"/></font>' +                                                        // 4: 11pt normal (bank values)
    '<font><b/><sz val="11"/><color rgb="FF1B5E20"/><name val="Arial"/></font>' +                             // 5: bold dark green 11pt (section)
    '<font><b/><sz val="11"/><color rgb="FFC00000"/><name val="Arial"/></font>' +                             // 6: bold red 11pt (cost label)
    '<font><b/><sz val="10"/><color rgb="FF1B5E20"/><name val="Arial"/></font>' +                             // 7: bold dark green 10pt (sub-label)
    '</fonts>' +
    '<fills count="4">' +
    '<fill><patternFill patternType="none"/></fill>' +                                                        // 0: none
    '<fill><patternFill patternType="gray125"/></fill>' +                                                     // 1: gray125 (required)
    '<fill><patternFill patternType="solid"><fgColor rgb="FF9CAF88"/></patternFill></fill>' +                 // 2: green #9CAF88
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF7F9F5"/></patternFill></fill>' +                 // 3: light green #F7F9F5
    '</fills>' +
    '<borders count="2">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +                                            // 0: no border
    '<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>' + // 1: thin black all sides
    '</borders>' +
    '<cellStyleXfs count="1"><xf borderId="0" fillId="0" fontId="0" numFmtId="0"/></cellStyleXfs>' +
    '<cellXfs count="16">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>' +                                                             // 0: default
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +                          // 1: header
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +                                                       // 2: title
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +                                         // 3: bold label
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +                          // 4: data center
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>' +                            // 5: data left
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +                                        // 6: data right
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +                                         // 7: total label
    '<xf numFmtId="164" fontId="3" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +                // 8: total formula
    '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +                                         // 9: section header
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +                                         // 10: bank label
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>' +                                         // 11: bank value
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +                // 12: price
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +                // 13: amount formula
    '<xf numFmtId="165" fontId="6" fillId="0" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' +                // 14: cost price (red, ¥)
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +               // 15: CBM/NW/GW
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0"/></cellStyles>' +
    '</styleSheet>';

  const files = [
    { path: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>'
    },
    { path: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'
    },
    { path: 'xl/workbook.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="PI" sheetId="1" r:id="rId1"/></sheets>' +
      '</workbook>'
    },
    { path: 'xl/_rels/workbook.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>'
    },
    { path: 'xl/worksheets/sheet1.xml', content: wsXml },
    { path: 'xl/sharedStrings.xml', content: ssXml },
    { path: 'xl/styles.xml', content: stylesXml },
  ];

  return createZip(files);
}

function createZip(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const centralDir = [];
  let offset = 0;

  files.forEach(file => {
    const contentBytes = encoder.encode(file.content);
    const filenameBytes = encoder.encode(file.path);
    const crc = crc32(contentBytes);

    const local = new Uint8Array(30 + filenameBytes.length + contentBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, contentBytes.length, true);
    lv.setUint32(22, contentBytes.length, true);
    lv.setUint16(26, filenameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(filenameBytes, 30);
    local.set(contentBytes, 30 + filenameBytes.length);

    parts.push(local);

    const cd = new Uint8Array(46 + filenameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, contentBytes.length, true);
    cv.setUint32(24, contentBytes.length, true);
    cv.setUint16(28, filenameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cd.set(filenameBytes, 46);

    centralDir.push(cd);
    offset += local.length;
  });

  const cdOffset = offset;
  const cdSize = centralDir.reduce((s, cd) => s + cd.length, 0);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + cdSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }
  for (const cd of centralDir) {
    result.set(cd, pos);
    pos += cd.length;
  }
  result.set(eocd, pos);

  let binary = '';
  for (let i = 0; i < result.length; i++) {
    binary += String.fromCharCode(result[i]);
  }
  return binary;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function colLetterToNum(col) {
  let num = 0;
  for (let i = 0; i < col.length; i++) {
    num = num * 26 + (col.charCodeAt(i) - 64);
  }
  return num;
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
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
