/**
 * Cloudflare Pages Function - Inquiry Handler
 * Handles /api/inquiry POST requests
 * Generates XLSX PI attachment + sends email via Resend
 */

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

  // Build Excel + send email
  try {
    const xlsxResult = await buildXlsx(contact, cart);
    console.log('XLSX built, piNo:', xlsxResult.piNo, 'buffer len:', xlsxResult.buffer.byteLength);
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

// ====== EXCEL + EMAIL ======

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function crc32_update(data) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeZip(files) {
  const entries = Object.entries(files);

  // Pass 1: compute offsets and sizes
  let offset = 0;
  const infos = entries.map(([path, raw]) => {
    let data;
    if (raw instanceof Uint8Array) data = raw;
    else if (raw instanceof ArrayBuffer) data = new Uint8Array(raw);
    else data = new TextEncoder().encode(String(raw));
    const name = new TextEncoder().encode(path);
    const nhdr = 30 + name.length;
    const cenSize = 46 + name.length;
    const myOffset = offset;
    offset += nhdr + data.length;
    return { name, data, crc: crc32_update(data), nhdr, cenSize, myOffset };
  });

  const cdOffset = offset;
  const cdLen = infos.reduce((a, i) => a + i.cenSize, 0);
  offset += cdLen + 22;

  // Pass 2: write everything into a single buffer (Uint8Array only, no DataView)
  const buf = new Uint8Array(offset);

  function u32(pos, val) {
    buf[pos]   = val & 0xff;
    buf[pos+1] = (val >>> 8) & 0xff;
    buf[pos+2] = (val >>> 16) & 0xff;
    buf[pos+3] = (val >>> 24) & 0xff;
  }
  function u16(pos, val) {
    buf[pos]   = val & 0xff;
    buf[pos+1] = (val >>> 8) & 0xff;
  }

  // Local file headers + data
  for (const info of infos) {
    const pos = info.myOffset;
    u32(pos,      0x04034b50);  // signature
    u16(pos + 4,  20);           // version needed
    u16(pos + 6,  0);            // general purpose bit flag
    u16(pos + 8,  0);            // compression method (store)
    u32(pos + 14, info.crc);    // crc-32
    u32(pos + 18, info.data.length); // compressed size
    u32(pos + 22, info.data.length); // uncompressed size
    u16(pos + 26, info.name.length); // filename length
    buf.set(info.name, pos + 30);
    buf.set(info.data, pos + 30 + info.name.length);
  }

  // Central directory
  let cp = cdOffset;
  for (const info of infos) {
    u32(cp,      0x02014b50);   // signature
    u16(cp + 4,  20);            // version made by
    u16(cp + 6,  0);             // flags
    u16(cp + 8,  0);             // compression
    u32(cp + 12, 0);             // file time
    u32(cp + 16, info.crc);     // crc-32
    u32(cp + 20, info.data.length); // compressed size
    u32(cp + 24, info.data.length); // uncompressed size
    u16(cp + 28, info.name.length); // filename length
    u16(cp + 30, 0);            // extra field length
    u16(cp + 32, 0);            // file comment length
    u16(cp + 34, 0);            // disk number start
    u32(cp + 38, info.myOffset); // relative offset of local header
    buf.set(info.name, cp + 46);
    cp += info.cenSize;
  }

  // End of central directory (22 bytes)
  u32(cp,      0x06054b50);   // signature
  u16(cp + 4,  0);            // number of this disk
  u16(cp + 6,  0);            // disk where central directory starts
  u16(cp + 8,  0);            // number of central directory records on this disk
  u16(cp + 10, infos.length); // total number of central directory records
  u32(cp + 12, cdLen);        // size of central directory
  u32(cp + 16, cdOffset);     // offset of start of central directory
  // (no comment, 2 zero bytes already default)

  return buf;
}

async function buildXlsx(contact, cart) {
  const now = new Date();
  const piNo = 'PI-' + now.getFullYear().toString().slice(-2)
    + now.toISOString().slice(5,10).replace(/-/g,'') + '-'
    + String(Math.floor(Math.random()*9999)).padStart(4,'0');

  const strPool = [];
  const strIdx = {};
  function ss(s) {
    const k = String(s);
    if (strIdx[k] !== undefined) return strIdx[k];
    const i = strPool.length;
    strPool.push(k);
    strIdx[k] = i;
    return i;
  }

  ss('PROFORMA INVOICE'); ss('TO:'); ss('ATTN:'); ss('TEL:'); ss('EMAIL:');
  ss('COMPANY:'); ss('REMARK:'); ss('From:'); ss('PARTY MAKER'); ss('Email:');
  ss('Date:'); ss('Port:'); ss('FOB Ningbo/Shanghai'); ss('TOTAL:');
  ss('No.'); ss('Item No.'); ss('Product Name'); ss('Description');
  ss('USD Price'); ss('Qty'); ss('Amount'); ss('Image URL');
  ss('TERMS & CONDITIONS');
  ss('1. FOB Ningbo/Shanghai.');
  ss('2. The price does not include any testing, inspection and auditing costs.');
  ss('3. Production time: 45 days after deposit is received.');
  ss('4. Payment method: 30% deposit, 70% balance to be paid before goods leave factory.');
  ss('Bank Information:'); ss(''); ss('BENEFICIARY:');
  ss('JIATAO INDUSTRY (SHANGHAI) CO.,LTD');
  ss('BANK OF NAME:'); ss('AGRICULTURAL BANK OF CHINA SHANGHAI YANGPU BRANCH');
  ss('BANK ADDRESS:'); ss('NO. 1128, XIANGYIN ROAD, YANGPU DISTRICT, SHANGHAI CHINA');
  ss('POST CODE:'); ss('200433'); ss('A/C NO.:'); ss('09421014040006209');
  ss('SWIFT CODE:'); ss('ABOCCNBJ090');

  cart.forEach(item => {
    ss(String(item.sku || '-'));
    ss(String(item.name || ''));
    ss(String(item.description || ''));
  });

  const files = {};
  const xh = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  files['[Content_Types].xml'] = xh+`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

  files['_rels/.rels'] = xh+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

  files['xl/_rels/workbook.xml.rels'] = xh+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  files['xl/workbook.xml'] = xh+`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="PI" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  files['xl/styles.xml'] = xh+`<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><sz val="16"/><b/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF9CAF88"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"><alignment horizontal="center"/></xf><xf numFmtId="2" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="center"/></xf><xf numFmtId="2" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="right"/></xf></cellXfs></styleSheet>`;

  const ssXml = strPool.map(s => `<si><t xml:space="preserve">${escapeHtml(s)}</t></si>`).join('');
  files['xl/sharedStrings.xml'] = xh+`<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strPool.length}" uniqueCount="${strPool.length}">${ssXml}</sst>`;

  files['docProps/core.xml'] = xh+`<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:creator>Party Maker</dc:creator><dcterms:created>${now.toISOString()}</dcterms:created></cp:coreProperties>`;

  files['docProps/app.xml'] = xh+`<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Party Maker</Application></Properties>`;

  files['xl/worksheets/_rels/sheet1.xml.rels'] = xh+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

  function col(c) { return String.fromCharCode(64 + c); }
  function sc(r, c, v) { return `<c r="${col(c)}${r}" s="0" t="s"><is><t>${escapeHtml(String(v))}</t></is></c>`; }
  function hc(r, c, v) { return `<c r="${col(c)}${r}" s="2" t="s"><is><t>${escapeHtml(String(v))}</t></is></c>`; }
  function bc(r, c, v) { return `<c r="${col(c)}${r}" s="0" t="s"><is><t>${escapeHtml(String(v))}</t></is></c>`; }
  function nc(r, c, v) { return `<c r="${col(c)}${r}" s="3"><v>${v}</v></c>`; }
  function rc(r, c, v) { return `<c r="${col(c)}${r}" s="4"><v>${v}</v></c>`; }

  const rows = [];
  let row = 1;

  rows.push(`<row r="${row}"><c r="A${row}" s="1" t="s"><is><t>PROFORMA INVOICE</t></is></c><c r="G${row}" s="1" t="s"><is><t>${escapeHtml(piNo)}</t></is></c></row>`);
  rows.push(`<row r="${++row}"><c r="A${row}" t="s"><is><t></t></is></c></row>`); row++;

  rows.push(`<row r="${row}">${sc(row,0,'TO:')}${bc(row,1,contact.name||'')}${sc(row,3,'From:')}${bc(row,4,'PARTY MAKER')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'ATTN:')}${bc(row,1,contact.name||'')}${sc(row,3,'Email:')}${bc(row,4,contact.email||'')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'TEL:')}${bc(row,1,contact.phone||'')}${sc(row,3,'Date:')}${bc(row,4,now.toISOString().slice(0,10))}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'COMPANY:')}${bc(row,1,contact.company||'')}${sc(row,3,'Port:')}${bc(row,4,'FOB Ningbo/Shanghai')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'REMARK:')}${bc(row,1,contact.country||'')}</row>`); row++;
  rows.push(`<row r="${row}"><c r="A${row}" t="s"><is><t></t></is></c></row>`); row++;

  rows.push(`<row r="${row}">${hc(row,0,'No.')}${hc(row,1,'Item No.')}${hc(row,2,'Product Name')}${hc(row,3,'Description')}${hc(row,4,'USD Price')}${hc(row,5,'Qty')}${hc(row,6,'Amount')}${hc(row,7,'Image URL')}</row>`); row++;

  let totalAmt = 0;
  cart.forEach((item, i) => {
    const qty = parseInt(item.quantity)||0;
    const price = parseFloat(item.price)||0;
    const amt = qty * price;
    totalAmt += amt;
    const imgUrl = (item.images && item.images[0]) ? item.images[0] : '';
    rows.push(`<row r="${row}">${nc(row,0,i+1)}${bc(row,1,item.sku||'-')}${bc(row,2,item.name||'')}${bc(row,3,item.description||'')}${rc(row,4,price)}${nc(row,5,qty)}${rc(row,6,amt)}${bc(row,7,imgUrl)}</row>`);
    row++;
  });

  rows.push(`<row r="${row}">${sc(row,5,'TOTAL:')}${rc(row,6,totalAmt)}</row>`); row++;
  rows.push(`<row r="${row}"><c r="A${row}" t="s"><is><t></t></is></c></row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'TERMS & CONDITIONS')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'1. FOB Ningbo/Shanghai.')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'2. The price does not include any testing, inspection and auditing costs.')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'3. Production time: 45 days after deposit is received.')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'4. Payment method: 30% deposit, 70% balance to be paid before goods leave factory.')}</row>`); row++;
  rows.push(`<row r="${row}"><c r="A${row}" t="s"><is><t></t></is></c></row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'Bank Information:')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'BENEFICIARY:')}${bc(row,1,'JIATAO INDUSTRY (SHANGHAI) CO.,LTD')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'BANK OF NAME:')}${bc(row,1,'AGRICULTURAL BANK OF CHINA SHANGHAI YANGPU BRANCH')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'BANK ADDRESS:')}${bc(row,1,'NO. 1128, XIANGYIN ROAD, YANGPU DISTRICT, SHANGHAI CHINA')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'POST CODE:')}${bc(row,1,'200433')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'A/C NO.:')}${bc(row,1,'09421014040006209')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'SWIFT CODE:')}${bc(row,1,'ABOCCNBJ090')}</row>`); row++;

  const colW = '<cols><col min="1" max="1" width="5" customWidth="1"/><col min="2" max="2" width="12" customWidth="1"/><col min="3" max="3" width="28" customWidth="1"/><col min="4" max="4" width="35" customWidth="1"/><col min="5" max="5" width="10" customWidth="1"/><col min="6" max="6" width="8" customWidth="1"/><col min="7" max="7" width="12" customWidth="1"/><col min="8" max="8" width="50" customWidth="1"/></cols>';

  files['xl/worksheets/sheet1.xml'] = xh+`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>${colW}<sheetData>${rows.join('')}</sheetData></worksheet>`;

  const zipBytes = makeZip(files);
  return { buffer: zipBytes.buffer, piNo };
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
  while (i < bytes.length) {
    const b1 = bytes[i++] || 0;
    const b2 = bytes[i++] || 0;
    const b3 = bytes[i++] || 0;
    result += chars[b1 >> 2];
    result += chars[((b1 & 3) << 4) | (b2 >> 4)];
    result += i - 1 > bytes.length ? '=' : chars[((b2 & 15) << 2) | (b3 >> 6)];
    result += i > bytes.length ? '=' : chars[b3 & 63];
  }
  return result;
}

async function buildAndSend(resendKey, contact, cart) {
  const { buffer, piNo } = await buildXlsx(contact, cart);
  const html = buildEmailHtml(contact, cart);

  // Resend API: JSON body with base64-encoded attachment
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
