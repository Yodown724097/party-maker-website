/**
 * Cloudflare Pages Function - Inquiry Handler
 * Path: /api/inquiry
 * Generates clean XLSX PI attachment + sends email via Resend
 * Uses SheetJS CDN for reliable XLSX generation (no ZIP complexity)
 */

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============ XLSX GENERATION (Fixed ZIP + CRC) ============

function crc32_update(crc, data) {
  const table = new Uint32Array(256);
  const CRC_TABLE = table;
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    CRC_TABLE[i] = c >>> 0;
  }
  let crc_val = (crc ^ 0xFFFFFFFF) >>> 0;
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
  for (let i = 0; i < bytes.length; i++) {
    crc_val = CRC_TABLE[(crc_val ^ bytes[i]) & 0xFF] ^ (crc_val >>> 8);
  }
  return (crc_val ^ 0xFFFFFFFF) >>> 0;
}

function makeZip(files) {
  // files: { 'path': string | Uint8Array | ArrayBuffer }
  const parts = [];
  const cdEntries = [];
  let offset = 0;

  for (const [path, rawData] of Object.entries(files)) {
    const bytes = rawData instanceof Uint8Array
      ? rawData
      : rawData instanceof ArrayBuffer
        ? new Uint8Array(rawData)
        : new TextEncoder().encode(rawData);

    const nameBytes = new TextEncoder().encode(path);
    const crc = crc32_update(0, bytes);
    const size = bytes.length;

    // Local file header (no compression = method 0)
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer, lh.byteOffset);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);   // version needed
    lv.setUint16(6, 0, true);   // flags
    lv.setUint16(8, 0, true);   // compression (store)
    lv.setUint16(10, 0, true);  // mod time
    lv.setUint16(12, 0, true);  // mod date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);
    parts.push(lh, bytes);

    // Central directory entry
    const cd = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(cd.buffer, cd.byteOffset);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, size, true);
    dv.setUint32(24, size, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint16(30, 0, true);
    dv.setUint16(32, 0, true);
    dv.setUint16(34, 0, true);
    dv.setUint32(36, 0, true);
    dv.setUint32(38, offset, true);
    cd.set(nameBytes, 46);
    cdEntries.push(cd);
    offset += 30 + nameBytes.length + size;
  }

  const cdOffset = offset;
  const cdTotalLen = cdEntries.reduce((a, e) => a + e.length, 0);

  // End of central directory (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdv = new DataView(eocd.buffer, eocd.byteOffset);
  eocdv.setUint32(0, 0x06054b50, true);
  eocdv.setUint16(4, 0, true);
  eocdv.setUint16(6, 0, true);
  eocdv.setUint16(8, 0, true);
  eocdv.setUint16(10, 0, true);
  eocdv.setUint32(12, cdTotalLen, true);
  eocdv.setUint32(16, cdTotalLen, true);
  eocdv.setUint32(20, cdOffset, true);

  const allParts = [...parts, ...cdEntries, eocd];
  const totalLen = allParts.reduce((a, b) => a + b.length, 0);
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of allParts) { result.set(p, pos); pos += p.length; }
  return result;
}

async function buildXlsx(contact, cart) {
  const now = new Date();
  const piNo = 'PI-' + now.getFullYear().toString().slice(-2)
    + now.toISOString().slice(5,10).replace(/-/g,'') + '-'
    + String(Math.floor(Math.random()*9999)).padStart(4,'0');

  // Build shared strings
  const strPool = [];
  const strIndex = {};
  function ss(str) {
    const k = String(str);
    if (strIndex[k] !== undefined) return strIndex[k];
    const idx = strPool.length;
    strPool.push(k);
    strIndex[k] = idx;
    return idx;
  }

  // Contact fields
  const attnIdx = ss('ATTN:');
  const telIdx  = ss('TEL:');
  const emailIdx = ss('EMAIL:');
  const coIdx   = ss('COMPANY:');
  const remarkIdx = ss('REMARK:');
  const fromIdx = ss('From:');
  const sellerIdx = ss('PARTY MAKER');
  const piIdx = ss('PI No.');
  const dateIdx = ss('Date:');
  const portIdx = ss('Port:');
  const totalIdx = ss('TOTAL:');
  const fobIdx = ss('FOB Ningbo/Shanghai');

  // Header row fields
  const hdrFields = ['No.','Item No.','Product Name','Description','USD Price','Qty','Amount','Image URL'];
  hdrFields.forEach(h => ss(h));

  // Cart strings
  cart.forEach(item => {
    ss(String(item.sku || '-'));
    ss(String(item.name || ''));
    ss(String(item.description || ''));
  });

  // Bank info strings
  const bankStrs = [
    'Bank Information:','','',
    'BENEFICIARY:','JIATAO INDUSTRY (SHANGHAI) CO.,LTD',
    'BANK OF NAME:','AGRICULTURAL BANK OF CHINA SHANGHAI YANGPU BRANCH',
    'BANK ADDRESS:','NO. 1128, XIANGYIN ROAD, YANGPU DISTRICT, SHANGHAI CHINA',
    'POST CODE:','200433',
    'A/C NO.:','09421014040006209',
    'SWIFT CODE:','ABOCCNBJ090',
  ];
  bankStrs.forEach(s => ss(s));

  // Terms strings
  const termsStrs = [
    'TERMS & CONDITIONS','','',
    '1. FOB Ningbo/Shanghai.',
    '2. The price does not include any testing, inspection and auditing costs.',
    '3. Production time: 45 days after deposit is received.',
    '4. Payment method: 30% deposit, 70% balance to be paid before the goods leave the factory.',
  ];
  termsStrs.forEach(s => ss(s));

  const ssXml = strPool.map(s => {
    return `<si><t xml:space="preserve">${escapeHtml(s)}</t></si>`;
  }).join('');

  const files = {};

  // [Content_Types].xml
  files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  // _rels/.rels
  files['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  // xl/_rels/workbook.xml.rels
  files['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // xl/workbook.xml
  files['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="PI" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  // xl/styles.xml (sage green header)
  files['xl/styles.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Arial"/></font>
    <font><sz val="16"/><b/><name val="Arial"/></font>
    <font><sz val="10"/><name val="Arial"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF9CAF88"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD4AF37"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color auto="1"/></left>
      <right style="thin"><color auto="1"/></right>
      <top style="thin"><color auto="1"/></top>
      <bottom style="thin"><color auto="1"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0"><alignment horizontal="center"/></xf>
    <xf numFmtId="2" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="center"/></xf>
    <xf numFmtId="2" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
  </cellXfs>
</styleSheet>`;

  // xl/sharedStrings.xml
  files['xl/sharedStrings.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strPool.length}" uniqueCount="${strPool.length}">${ssXml}</sst>`;

  // docProps/core.xml
  files['docProps/core.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
  <dc:creator>Party Maker</dc:creator>
  <dcterms:created>${now.toISOString()}</dcterms:created>
</cp:coreProperties>`;

  files['docProps/app.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Party Maker</Application>
</Properties>`;

  // xl/worksheets/_rels/sheet1.xml.rels
  files['xl/worksheets/_rels/sheet1.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/> `;

  // Column widths: A=No, B=SKU, C=Name, D=Desc, E=Price, F=Qty, G=Amount, H=ImageURL
  const colW = '<cols><col min="1" max="1" width="5" customWidth="1"/>'
    + '<col min="2" max="2" width="12" customWidth="1"/>'
    + '<col min="3" max="3" width="28" customWidth="1"/>'
    + '<col min="4" max="4" width="35" customWidth="1"/>'
    + '<col min="5" max="5" width="10" customWidth="1"/>'
    + '<col min="6" max="6" width="8" customWidth="1"/>'
    + '<col min="7" max="7" width="12" customWidth="1"/>'
    + '<col min="8" max="8" width="50" customWidth="1"/></cols>';

  function sc(r, c, val) {
    return `<c r="${String.fromCharCode(64+c)}${r}" s="0" t="s"><is><t>${escapeHtml(String(val))}</t></is></c>`;
  }
  function nc(r, c, val, fmt) {
    const s_attr = fmt ? ' s="4"' : '';
    return `<c r="${String.fromCharCode(64+c)}${r}"${s_attr}><v>${val}</v></c>`;
  }
  function hc(r, c, val) {
    return `<c r="${String.fromCharCode(64+c)}${r}" s="2" t="s"><is><t>${escapeHtml(String(val))}</t></is></c>`;
  }
  function gc(r, c, val) {
    return `<c r="${String.fromCharCode(64+c)}${r}" s="6" t="s"><is><t>${escapeHtml(String(val))}</t></is></c>`;
  }
  function bc(r, c, val) {
    return `<c r="${String.fromCharCode(64+c)}${r}" s="5" t="s"><is><t>${escapeHtml(String(val))}</t></is></c>`;
  }

  // Build rows
  const rows = [];
  let row = 1;

  // Row 1: PI Title
  rows.push(`<row r="${row}" ht="30" customHeight="1">`
    + `<c r="A${row}" s="1" t="s"><is><t>PROFORMA INVOICE</t></is></c>`
    + `<c r="G${row}" s="1" t="s"><is><t>${escapeHtml(piNo)}</t></is></c></row>`);
  row++;

  rows.push(`<row r="${row}"><c r="A${row}" t="s"><is><t></t></is></c></row>`);
  row++;

  // Contact info (left)
  rows.push(`<row r="${row}">${sc(row,0,'TO:')}${gc(row,1,contact.name||'')}${sc(row,3,'From:')}${gc(row,4,'PARTY MAKER')}</row>`);
  row++;
  rows.push(`<row r="${row}">${sc(row,0,'ATTN:')}${gc(row,1,contact.name||'')}${sc(row,3,'Email:')}${gc(row,4,contact.email||'')}</row>`);
  row++;
  rows.push(`<row r="${row}">${sc(row,0,'TEL:')}${gc(row,1,contact.phone||'')}${sc(row,3,'Date:')}${gc(row,4,now.toISOString().slice(0,10))}</row>`);
  row++;
  rows.push(`<row r="${row}">${sc(row,0,'COMPANY:')}${gc(row,1,contact.company||'')}${sc(row,3,'Port:')}${gc(row,4,'FOB Ningbo/Shanghai')}</row>`);
  row++;
  rows.push(`<row r="${row}">${sc(row,0,'REMARK:')}${gc(row,1,contact.country||'')}</row>`);
  row++;

  rows.push(`<row r="${row}"><c r="A${row}" t="s"><is><t></t></is></c></row>`);
  row++;

  // Table header
  const hdrRow = row;
  rows.push(`<row r="${row}">${hc(row,0,'No.')}${hc(row,1,'Item No.')}${hc(row,2,'Product Name')}${hc(row,3,'Description')}${hc(row,4,'USD Price')}${hc(row,5,'Qty')}${hc(row,6,'Amount')}${hc(row,7,'Image URL')}</row>`);
  row++;

  // Data rows
  let totalAmt = 0;
  const dataStartRow = row;
  cart.forEach((item, i) => {
    const qty = parseInt(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    const amt = qty * price;
    totalAmt += amt;
    const imgUrl = (item.images && item.images[0]) ? item.images[0] : '';
    rows.push(`<row r="${row}">${nc(row,0,i+1,0)}${gc(row,1,item.sku||'-')}${gc(row,2,item.name||'')}${gc(row,3,item.description||'')}${nc(row,4,price,1)}${nc(row,5,qty,0)}${nc(row,6,amt,1)}${gc(row,7,imgUrl)}</row>`);
    row++;
  });

  // Total row
  rows.push(`<row r="${row}">${sc(row,5,'TOTAL:')}${nc(row,6,totalAmt,1)}</row>`);
  row++;

  rows.push(`<row r="${row}"><c r="A${row}" t="s"><is><t></t></is></c></row>`);
  row++;

  // Terms section
  rows.push(`<row r="${row}">${sc(row,0,'TERMS & CONDITIONS')}</row>`);
  row++;
  rows.push(`<row r="${row}">${sc(row,0,'1. FOB Ningbo/Shanghai.')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'2. The price does not include any testing, inspection and auditing costs.')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'3. Production time: 45 days after deposit is received.')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'4. Payment method: 30% deposit, 70% balance to be paid before goods leave factory.')}</row>`); row++;
  rows.push(`<row r="${row}"><c r="A${row}" t="s"><is><t></t></is></c></row>`);
  row++;

  // Bank info
  rows.push(`<row r="${row}">${sc(row,0,'Bank Information:')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'BENEFICIARY:')}${gc(row,1,'JIATAO INDUSTRY (SHANGHAI) CO.,LTD')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'BANK OF NAME:')}${gc(row,1,'AGRICULTURAL BANK OF CHINA SHANGHAI YANGPU BRANCH')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'BANK ADDRESS:')}${gc(row,1,'NO. 1128, XIANGYIN ROAD, YANGPU DISTRICT, SHANGHAI CHINA')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'POST CODE:')}${gc(row,1,'200433')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'A/C NO.:')}${gc(row,1,'09421014040006209')}</row>`); row++;
  rows.push(`<row r="${row}">${sc(row,0,'SWIFT CODE:')}${gc(row,1,'ABOCCNBJ090')}</row>`); row++;

  files['xl/worksheets/sheet1.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>
  ${colW}
  <sheetData>${rows.join('')}</sheetData>
</worksheet>`;

  const zipBytes = makeZip(files);
  return { buffer: zipBytes.buffer, piNo };
}

// ============ EMAIL ============
function buildEmailHtml(contact, cart) {
  const total = cart.reduce((sum, item) => sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.price) || 0)), 0);
  const rows = cart.map((item, i) => {
    const qty = parseInt(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    const subtotal = qty * price;
    const imgTag = (item.images && item.images[0])
      ? `<img src="${item.images[0]}" style="width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid #D9E0D1;"/>`
      : `<div style="width:64px;height:64px;background:#F7F9F5;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#8A9A7A;">No Img</div>`;
    return `<tr>
      <td style="padding:10px 8px;border-bottom:1px solid #D9E0D1;text-align:center;font-size:13px;color:#7A8B6E;">${i+1}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #D9E0D1;font-size:12px;font-weight:600;color:#7A8B6E;">${escapeHtml(item.sku||'-')}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #D9E0D1;text-align:center;">${imgTag}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #D9E0D1;font-size:13px;">${escapeHtml(item.name||'')}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #D9E0D1;text-align:center;font-size:13px;">${qty}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #D9E0D1;text-align:right;font-size:13px;">$${price.toFixed(2)}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #D9E0D1;text-align:right;font-size:13px;font-weight:700;color:#7A8B6E;">$${subtotal.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const phoneRow = contact.phone
    ? `<div><strong>Phone:</strong> <a href="tel:${escapeHtml(contact.phone)}" style="color:#9CAF88;">${escapeHtml(contact.phone)}</a></div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>New Inquiry - Party Maker</title></head>
<body style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:20px;background:#F7F9F5;">
  <div style="background:#9CAF88;color:white;padding:28px 24px;border-radius:12px 12px 0 0;">
    <h1 style="margin:0;font-size:1.5rem;font-weight:700;">New Product Inquiry</h1>
    <p style="margin:6px 0 0;opacity:0.9;font-size:0.9rem;">From Party Maker Website</p>
  </div>
  <div style="background:white;padding:20px 24px;border:1px solid #D9E0D1;border-top:none;">
    <h2 style="font-size:0.9rem;color:#7A8B6E;margin:0 0 12px;font-weight:600;border-bottom:1px solid #D9E0D1;padding-bottom:8px;">Contact Information</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.88rem;color:#333;">
      <div><strong>Name:</strong> ${escapeHtml(contact.name||'-')}</div>
      <div><strong>Email:</strong> <a href="mailto:${escapeHtml(contact.email||'')}" style="color:#9CAF88;">${escapeHtml(contact.email||'-')}</a></div>
      <div><strong>Company:</strong> ${escapeHtml(contact.company||'-')}</div>
      <div><strong>Country:</strong> ${escapeHtml(contact.country||'-')}</div>
      ${phoneRow ? `<div><strong>Phone:</strong> <a href="tel:${escapeHtml(contact.phone||'')}" style="color:#9CAF88;">${escapeHtml(contact.phone||'-')}</a></div>` : ''}
    </div>
    ${contact.message ? `<div style="margin-top:12px;font-size:0.88rem;color:#333;background:#F7F9F5;padding:10px;border-radius:6px;"><strong>Message:</strong> ${escapeHtml(contact.message)}</div>` : ''}
  </div>
  <div style="background:white;padding:20px 24px;border:1px solid #D9E0D1;border-top:none;border-radius:0 0 12px 12px;margin-bottom:20px;">
    <h2 style="font-size:0.9rem;color:#7A8B6E;margin:0 0 12px;font-weight:600;">Selected Products (${cart.length} items)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:0.88rem;background:white;border:1px solid #D9E0D1;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#9CAF88;color:white;">
          <th style="padding:10px 8px;text-align:center;">#</th>
          <th style="padding:10px 8px;text-align:center;">SKU</th>
          <th style="padding:10px 8px;text-align:center;">Image</th>
          <th style="padding:10px 8px;text-align:left;">Product</th>
          <th style="padding:10px 8px;text-align:center;">Qty</th>
          <th style="padding:10px 8px;text-align:right;">Price</th>
          <th style="padding:10px 8px;text-align:right;">Subtotal</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#F7F9F5;">
          <td colspan="5" style="padding:10px 8px;"></td>
          <td style="padding:10px 8px;text-align:right;font-weight:700;color:#7A8B6E;font-size:0.9rem;">TOTAL:</td>
          <td style="padding:10px 8px;text-align:right;font-weight:700;color:#7A8B6E;font-size:1rem;">$${total.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
    <p style="font-size:0.78rem;color:#8A9A7A;margin:12px 0 0;">* An Excel PI sheet is attached to this email for your reference.</p>
  </div>
  <div style="text-align:center;font-size:0.75rem;color:#8A9A7A;margin-top:16px;">
    Sent via Party Maker Website &bull; <a href="https://party-maker-website.pages.dev" style="color:#9CAF88;">party-maker-website.pages.dev</a>
  </div>
</body>
</html>`;
}

// ============ HANDLER ============
async function handleRequest(request) {
  if (request.method !== 'POST') {
    return new Response('POST only', { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch(e) {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { contact = {}, cart = [] } = body;
  if (!contact.name || !contact.email || !cart || cart.length === 0) {
    return new Response('Missing required fields', { status: 400 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return new Response('RESEND_API_KEY not configured', { status: 500 });
  }

  // Build Excel
  const { buffer, piNo } = await buildXlsx(contact, cart);

  // Build email HTML
  const html = buildEmailHtml(contact, cart);

  // Send email with attachment
  const formData = new FormData();
  formData.append('from', 'Party Maker <onboarding@resend.dev>');
  formData.append('to', '724097@qq.com');
  formData.append('subject', `New Inquiry from ${contact.name} - ${piNo}`);
  formData.append('html', html);
  formData.append('attachments', new File([buffer], `${piNo}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}` },
    body: formData,
  });

  if (!resendRes.ok) {
    const err = await resendRes.text();
    return new Response(JSON.stringify({ error: 'Failed to send email', detail: err }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }

  const result = await resendRes.json();
  return new Response(JSON.stringify({ success: true, emailId: result.id, piNo }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
