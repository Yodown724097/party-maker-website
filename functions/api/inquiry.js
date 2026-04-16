/**
 * Cloudflare Pages Function - Inquiry Handler
 * Uses template-based XLSX generation for maximum compatibility
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
    return new Response(JSON.stringify({error:'Missing required fields'}), {
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
    return new Response(JSON.stringify({success:true, ...result}), {
      headers: {'Content-Type':'application/json'}
    });
  } catch(e) {
    console.error('Inquiry error:', e.message);
    return new Response(JSON.stringify({error: e.message}), {
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

function padNum(n, len) {
  return String(n).padStart(len, '0');
}

// RFC 4648 Base64
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
    result += i - 1 < len ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    result += i < len ? chars[b3 & 63] : '=';
  }
  return result;
}

// CRC32
const CRC32_TABLE = new Uint32Array([
  0x00000000,0x77073096,0xee0e612c,0x990951ba,0x076dc419,0x706af48f,0xe963a535,0x9e6495a3,
  0x0edb8832,0x79dcb8a4,0xe0d5e91e,0x97d2d988,0x09b64c2b,0x7eb17cbd,0xe7b82d07,0x90bf1d91,
  0x1db71064,0x6ab020f2,0xf3b97148,0x84be41de,0x1adad47d,0x6ddde4eb,0xf4d4b551,0x83d385c7,
  0x136c9856,0x646ba8c0,0xfd62f97a,0x8a65c9ec,0x14015c4f,0x63066cd9,0xfa0f3d63,0x8d080df5,
  0x3b6e20c8,0x4c69105e,0xd56041e4,0xa2677172,0x3c03e4d1,0x4b04d447,0xd20d85fd,0xa50ab56b,
  0x35b5a8fa,0x42b2986c,0xdbbbc9d6,0xacbcf940,0x32d86ce3,0x45df5c75,0xdcd60dcf,0xabd13d59,
  0x26d930ac,0x51de003a,0xc8d75180,0xbfd06116,0x21b4f4b5,0x56b3c423,0xcfba9599,0xb8bda50f,
  0x2802b89e,0x5f058808,0xc60cd9b2,0xb10be924,0x2f6f7c87,0x58684c11,0xc1611dab,0xb6662d3d,
  0x76dc4190,0x01db7106,0x98d220bc,0xefd5102a,0x71b18589,0x06b6b51f,0x9fbfe4a5,0xe8b8d433,
  0x7807c9a2,0x0f00f934,0x9609a88e,0xe10e9818,0x7f6a0dbb,0x086d3d2d,0x91646c97,0xe6635c01,
  0x6b6b51f4,0x1c6c6162,0x856530d8,0xf262004e,0x6c0695ed,0x1b01a57b,0x8208f4c1,0xf50fc457,
  0x65b0d9c6,0x12b7e950,0x8bbeb8ea,0xfcb9887c,0x62dd1ddf,0x15da2d49,0x8cd37cf3,0xfb244c65,
  0x4d426158,0x3a4571ce,0xa34c2074,0xd44b10e2,0x4a2f8541,0x3d28b5d7,0xa421e46d,0xd326d4fb,
  0x4399c96a,0x349ef9fc,0xad97a846,0xda9098d0,0x44f40d73,0x33f33de5,0xaa6a6c5f,0xdd6d5cc9,
  0x5065513c,0x276261aa,0xbe6b3010,0xc96c0086,0x57089525,0x200fa5b3,0xb906f409,0xce01c49f,
  0x5ebed90e,0x29b9e998,0xb0b0b822,0xc7b788b4,0x59d31d17,0x2ed42d81,0xb7dd7c3b,0xc0da4cad,
  0xedb88320,0x9abfb3b6,0x03b6e20c,0x74b1d29a,0xead54739,0x9dd277af,0x04db2615,0x73dc1683,
  0xe3630b12,0x94643b84,0x0d6d6a3e,0x7a6a5aa8,0xe40ecf0b,0x9309ff9d,0x0a00ae27,0x7d079eb1,
  0xf00f9344,0x8708a3d2,0x1e01f268,0x6906c2fe,0xf762575d,0x806567cb,0x196c3671,0x6e6b06e7,
  0xfed41b76,0x89d32be0,0x10da7a5a,0x67dd4acc,0xf9b9df6f,0x8ebeeff9,0x17b7be43,0x60b08ed5,
  0xd6d6a3e8,0xa1d1937e,0x38d8c2c4,0x4fdff252,0xd1bb67f1,0xa6bc5767,0x3fb506dd,0x48b2364b,
  0xd80d2bda,0xaf0a1b4c,0x36034af6,0x41047a60,0xdf60efc3,0xa867df55,0x316e8eef,0x4669be79,
  0xcb61b38c,0xbc66831a,0x256fd2a0,0x5268e236,0xcc0c7795,0xbb0b4703,0x220216b9,0x5505262f,
  0xc5ba3bbe,0xb2bd0b28,0x2bb45a92,0x5cb36a04,0xc2d7ffa7,0xb5d0cf31,0x2cd99e8b,0x5bdeae1d,
  0x9b64c2b0,0xec63f226,0x756aa39c,0x026d930a,0x9c0906a9,0xeb0e363f,0x72076785,0x05005713,
  0x95bf4a82,0xe2b87a14,0x7bb12bae,0x0cb61b38,0x92d28e9b,0xe5d5be0d,0x7cdcefb7,0x0bdbdf21,
  0x86d3d2d4,0xf1d4e242,0x68ddb3f8,0x1fda836e,0x81be16cd,0xf6b9265b,0x6fb077e1,0x18b74777,
  0x88085ae6,0xff0f6a70,0x66063bca,0x11010b5c,0x8f659eff,0xf862ae69,0x616bffd3,0x166ccf45,
  0xa00ae278,0xd70dd2ee,0x4e048354,0x3903b3c2,0xa7672661,0xd06016f7,0x4969474d,0x3e6e77db,
  0xaed16a4a,0xd9d65adc,0x40df0b66,0x37d83bf0,0xa9bcae53,0xdebb9ec5,0x47b2cf7f,0x30b5ffe9,
  0xbdbdf21c,0xcabac28a,0x53b39330,0x24b4a3a6,0xbad03605,0xcdd706b3,0x54de5709,0x23d9679f,
  0xb3667a0e,0xc4614a98,0x5d681b22,0x2a6f2bb4,0xb40bbe17,0xc30c8e81,0x5a05df3b,0x2d02efad
]);

function crc32(data) {
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
  let crc = 0xFFFFFFFF >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Build ZIP using deflate compression (not store)
async function makeZipCompressed(files) {
  const encoder = new TextEncoder();
  const entries = [];

  // First pass: encode all content
  for (const [path, raw] of Object.entries(files)) {
    const data = raw instanceof Uint8Array ? raw : encoder.encode(String(raw));
    entries.push({ path, data });
  }

  // Compress each file
  const compressed = [];
  for (const entry of entries) {
    const cs = new CompressionStream('deflate');
    const writer = cs.writable.getWriter();
    writer.write(entry.data);
    writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    compressed.push({ ...entry, compressed: new Uint8Array(buf) });
  }

  // Calculate offsets
  let offset = 0;
  for (const entry of compressed) {
    entry.headerOffset = offset;
    offset += 30 + entry.path.length + entry.compressed.length;
  }
  const cdOffset = offset;
  const cdLen = compressed.reduce((sum, e) => sum + 46 + e.path.length, 0);
  offset += cdLen + 22;

  // Build buffer
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

  // Local headers + compressed data
  for (const entry of compressed) {
    const p = entry.headerOffset;
    u32(p, 0x04034b50);
    u16(p+4, 20);
    u16(p+6, 0);
    u16(p+8, 8);  // DEFLATE compression
    u32(p+14, crc32(entry.data));
    u32(p+18, entry.compressed.length);
    u32(p+22, entry.data.length);
    u16(p+26, entry.path.length);
    buf.set(encoder.encode(entry.path), p+30);
    buf.set(entry.compressed, p+30+entry.path.length);
  }

  // Central directory
  let cp = cdOffset;
  for (const entry of compressed) {
    u32(cp, 0x02014b50);
    u16(cp+4, 20);
    u16(cp+6, 0);
    u16(cp+8, 8);
    u32(cp+12, 0);
    u32(cp+16, crc32(entry.data));
    u32(cp+20, entry.compressed.length);
    u32(cp+24, entry.data.length);
    u16(cp+28, entry.path.length);
    u16(cp+30, 0);
    u16(cp+32, 0);
    u16(cp+34, 0);
    u32(cp+38, entry.headerOffset);
    buf.set(encoder.encode(entry.path), cp+46);
    cp += 46 + entry.path.length;
  }

  // End of central directory
  u32(cp, 0x06054b50);
  u16(cp+4, 0);
  u16(cp+6, 0);
  u16(cp+8, 0);
  u16(cp+10, compressed.length);
  u32(cp+12, cdLen);
  u32(cp+16, cdOffset);

  return buf;
}

// Build simple ZIP (store mode) - more compatible
function makeZip(files) {
  const encoder = new TextEncoder();
  const entries = Object.entries(files);

  let offset = 0;
  const infos = entries.map(([path, raw]) => {
    const data = raw instanceof Uint8Array ? raw : encoder.encode(String(raw));
    const name = encoder.encode(path);
    const nhdr = 30 + name.length;
    const cenSize = 46 + name.length;
    const myOffset = offset;
    offset += nhdr + data.length;
    return { name, data, crc: crc32(data), nhdr, cenSize, myOffset };
  });

  const cdOffset = offset;
  const cdLen = infos.reduce((a, i) => a + i.cenSize, 0);
  offset += cdLen + 22;

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

  // Local file headers
  for (const info of infos) {
    const p = info.myOffset;
    u32(p, 0x04034b50);
    u16(p+4, 20);
    u16(p+6, 0);
    u16(p+8, 0);
    u32(p+14, info.crc);
    u32(p+18, info.data.length);
    u32(p+22, info.data.length);
    u16(p+26, info.name.length);
    buf.set(info.name, p+30);
    buf.set(info.data, p+30+info.name.length);
  }

  // Central directory - MUST be in same order as local headers
  let cp = cdOffset;
  for (const info of infos) {
    u32(cp, 0x02014b50);
    u16(cp+4, 20);
    u16(cp+6, 0);
    u16(cp+8, 0);
    u32(cp+12, 0);
    u32(cp+16, info.crc);
    u32(cp+20, info.data.length);
    u32(cp+24, info.data.length);
    u16(cp+28, info.name.length);
    u16(cp+30, 0);
    u16(cp+32, 0);
    u16(cp+34, 0);
    u32(cp+38, info.myOffset);
    buf.set(info.name, cp+46);
    cp += info.cenSize;
  }

  // End of central directory
  u32(cp, 0x06054b50);
  u16(cp+4, 0);
  u16(cp+6, 0);
  u16(cp+8, 0);
  u16(cp+10, infos.length);
  u32(cp+12, cdLen);
  u32(cp+16, cdOffset);

  return buf;
}

async function buildXlsx(contact, cart) {
  const now = new Date();
  const piNo = 'PI-' + now.getFullYear().toString().slice(-2)
    + padNum(now.getMonth()+1, 2) + padNum(now.getDate(), 2) + '-'
    + padNum(Math.floor(Math.random()*9999), 4);

  const xh = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const nsR = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const nsPkg = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  const nsCp = 'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"';
  const nsDc = 'xmlns:dc="http://purl.org/dc/elements/1.1/"';
  const nsDct = 'xmlns:dcterms="http://purl.org/dc/terms/"';
  const nsEp = 'xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"';

  const files = {};

  // Content_Types
  files['[Content_Types].xml'] = xh+'<Types><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';

  // Root rels
  files['_rels/.rels'] = xh+'<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';

  // Workbook rels
  files['xl/_rels/workbook.xml.rels'] = xh+'<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';

  // Workbook
  files['xl/workbook.xml'] = xh+`<workbook ${ns} ${nsR}><sheets><sheet name="PI" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  // Styles (simplified)
  files['xl/styles.xml'] = xh+`<styleSheet ${ns}><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><sz val="14"/><b/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF9CAF88"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"><alignment horizontal="center"/></xf><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0"><alignment horizontal="center"/></xf><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0"><alignment horizontal="right"/></xf></cellXfs></styleSheet>`;

  // Core properties
  files['docProps/core.xml'] = xh+`<cp:coreProperties ${nsCp} ${nsDc} ${nsDct}><dc:creator>Party Maker</dc:creator><dcterms:created>${now.toISOString()}</dcterms:created></cp:coreProperties>`;

  // App properties
  files['docProps/app.xml'] = xh+`<Properties ${nsEp}><Application>Party Maker</Application></Properties>`;

  // Build worksheet XML manually
  const colLetter = (n) => String.fromCharCode(64 + n);

  let rowsXml = '';

  // Row 1: Title
  rowsXml += `<row r="1"><c r="A1" s="1"><v/></c></row>`;
  rowsXml += `<row r="2"><c r="A2" s="1"><v/></c></row>`;

  // Row 3: TO/FROM
  rowsXml += `<row r="3"><c r="A3" s="0"><v>TO:</v></c><c r="B3" s="0"><v>${escapeHtml(contact.name||'')}</v></c><c r="D3" s="0"><v>From:</v></c><c r="E3" s="0"><v>PARTY MAKER</v></c></row>`;
  rowsXml += `<row r="4"><c r="A4" s="0"><v>ATTN:</v></c><c r="B4" s="0"><v>${escapeHtml(contact.name||'')}</v></c><c r="D4" s="0"><v>Email:</v></c><c r="E4" s="0"><v>${escapeHtml(contact.email||'')}</v></c></row>`;
  rowsXml += `<row r="5"><c r="A5" s="0"><v>TEL:</v></c><c r="B5" s="0"><v>${escapeHtml(contact.phone||'')}</v></c><c r="D5" s="0"><v>Date:</v></c><c r="E5" s="0"><v>${now.toISOString().slice(0,10)}</v></c></row>`;
  rowsXml += `<row r="6"><c r="A6" s="0"><v>COMPANY:</v></c><c r="B6" s="0"><v>${escapeHtml(contact.company||'')}</v></c><c r="D6" s="0"><v>Port:</v></c><c r="E6" s="0"><v>FOB Ningbo/Shanghai</v></c></row>`;
  rowsXml += `<row r="7"><c r="A7" s="0"><v>REMARK:</v></c><c r="B7" s="0"><v>${escapeHtml(contact.country||'')}</v></c></row>`;
  rowsXml += `<row r="8"><c r="A8" s="0"><v/></c></row>`;

  // Row 9: Headers
  rowsXml += `<row r="9"><c r="A9" s="2"><v>No.</v></c><c r="B9" s="2"><v>Item No.</v></c><c r="C9" s="2"><v>Product Name</v></c><c r="D9" s="2"><v>Description</v></c><c r="E9" s="2"><v>USD Price</v></c><c r="F9" s="2"><v>Qty</v></c><c r="G9" s="2"><v>Amount</v></c><c r="H9" s="2"><v>Image URL</v></c></row>`;

  // Data rows
  let rowNum = 10;
  let totalAmt = 0;
  cart.forEach((item, i) => {
    const qty = parseInt(item.quantity)||0;
    const price = parseFloat(item.price)||0;
    const amt = qty * price;
    totalAmt += amt;
    const imgUrl = (item.images && item.images[0]) ? item.images[0] : '';

    rowsXml += `<row r="${rowNum}">`;
    rowsXml += `<c r="A${rowNum}" s="3"><v>${i+1}</v></c>`;
    rowsXml += `<c r="B${rowNum}" s="0"><v>${escapeHtml(item.sku||'-')}</v></c>`;
    rowsXml += `<c r="C${rowNum}" s="0"><v>${escapeHtml(item.name||'')}</v></c>`;
    rowsXml += `<c r="D${rowNum}" s="0"><v>${escapeHtml(item.description||'')}</v></c>`;
    rowsXml += `<c r="E${rowNum}" s="4"><v>${price}</v></c>`;
    rowsXml += `<c r="F${rowNum}" s="3"><v>${qty}</v></c>`;
    rowsXml += `<c r="G${rowNum}" s="4"><v>${amt}</v></c>`;
    rowsXml += `<c r="H${rowNum}" s="0"><v>${escapeHtml(imgUrl)}</v></c>`;
    rowsXml += `</row>`;
    rowNum++;
  });

  // Total row
  rowsXml += `<row r="${rowNum}"><c r="F${rowNum}" s="0"><v>TOTAL:</v></c><c r="G${rowNum}" s="4"><v>${totalAmt}</v></c></row>`;
  rowNum += 2;

  // Bank info
  rowsXml += `<row r="${rowNum}"><c r="A${rowNum}" s="0"><v>Bank Information:</v></c></row>`; rowNum++;
  rowsXml += `<row r="${rowNum}"><c r="A${rowNum}" s="0"><v>BENEFICIARY:</v></c><c r="B${rowNum}" s="0"><v>JIATAO INDUSTRY (SHANGHAI) CO.,LTD</v></c></row>`; rowNum++;
  rowsXml += `<row r="${rowNum}"><c r="A${rowNum}" s="0"><v>BANK:</v></c><c r="B${rowNum}" s="0"><v>AGRICULTURAL BANK OF CHINA SHANGHAI YANGPU BRANCH</v></c></row>`; rowNum++;
  rowsXml += `<row r="${rowNum}"><c r="A${rowNum}" s="0"><v>A/C NO.:</v></c><c r="B${rowNum}" s="0"><v>09421014040006209</v></c></row>`; rowNum++;
  rowsXml += `<row r="${rowNum}"><c r="A${rowNum}" s="0"><v>SWIFT:</v></c><c r="B${rowNum}" s="0"><v>ABOCCNBJ090</v></c></row>`;

  const sheetXml = xh+`<worksheet ${ns} ${nsR}><sheetViews><sheetView workbookViewId="0" showGridLines="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews><cols><col min="1" max="1" width="6" customWidth="1"/><col min="2" max="2" width="12" customWidth="1"/><col min="3" max="3" width="25" customWidth="1"/><col min="4" max="4" width="35" customWidth="1"/><col min="5" max="5" width="12" customWidth="1"/><col min="6" max="6" width="8" customWidth="1"/><col min="7" max="7" width="12" customWidth="1"/><col min="8" max="8" width="50" customWidth="1"/></cols><sheetData>${rowsXml}</sheetData></worksheet>`;

  files['xl/worksheets/sheet1.xml'] = sheetXml;

  // Build ZIP
  const zipBytes = makeZip(files);
  return { buffer: zipBytes.buffer, piNo };
}

function buildEmailHtml(contact, cart) {
  const total = cart.reduce((sum, item) => sum + ((parseInt(item.quantity)||0)*(parseFloat(item.price)||0)), 0);
  const phoneRow = contact.phone ? `<div><strong>Phone:</strong> ${escapeHtml(contact.phone)}</div>` : '';
  const rows = cart.map((item, i) => {
    const qty = parseInt(item.quantity)||0;
    const price = parseFloat(item.price)||0;
    const subtotal = qty * price;
    const imgTag = (item.images && item.images[0])
      ? `<img src="${item.images[0]}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;"/>`
      : `<div style="width:48px;height:48px;background:#eee;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#999;">No Img</div>`;
    return `<tr><td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${i+1}</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${escapeHtml(item.sku||'-')}</td><td style="padding:8px;border-bottom:1px solid #eee;">${imgTag}</td><td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(item.name||'')}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${qty}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">$${price.toFixed(2)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;">$${subtotal.toFixed(2)}</td></tr>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;background:#f5f5f5;"><div style="background:#9CAF88;color:white;padding:24px;border-radius:8px 8px 0 0;"><h1 style="margin:0;">New Product Inquiry</h1><p style="margin:8px 0 0;opacity:0.9;">From Party Maker Website</p></div><div style="background:white;padding:20px;border:1px solid #ddd;border-top:none;"><h2 style="font-size:14px;color:#666;margin:0 0 10px;border-bottom:1px solid #ddd;padding-bottom:8px;">Contact Information</h2><div style="font-size:13px;color:#333;"><div><strong>Name:</strong> ${escapeHtml(contact.name||'-')}</div><div><strong>Email:</strong> <a href="mailto:${escapeHtml(contact.email||'')}" style="color:#9CAF88;">${escapeHtml(contact.email||'')}</a></div><div><strong>Company:</strong> ${escapeHtml(contact.company||'-')}</div><div><strong>Country:</strong> ${escapeHtml(contact.country||'-')}</div>${phoneRow}</div></div><div style="background:white;padding:20px;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px;"><h2 style="font-size:14px;color:#666;margin:0 0 10px;">Products (${cart.length} items)</h2><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:#f9f9f9;"><th style="padding:8px;text-align:center;">#</th><th style="padding:8px;text-align:center;">SKU</th><th style="padding:8px;text-align:center;">Image</th><th style="padding:8px;">Product</th><th style="padding:8px;text-align:center;">Qty</th><th style="padding:8px;text-align:right;">Price</th><th style="padding:8px;text-align:right;">Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr style="background:#f9f9f9;"><td colspan="5"></td><td style="padding:8px;text-align:right;font-weight:bold;">TOTAL:</td><td style="padding:8px;text-align:right;font-weight:bold;">$${total.toFixed(2)}</td></tr></tfoot></table></div></body></html>`;
}

async function buildAndSend(resendKey, contact, cart) {
  const { buffer, piNo } = await buildXlsx(contact, cart);
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
