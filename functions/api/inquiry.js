/**
 * Cloudflare Pages Function - Inquiry Handler
 * Path: /api/inquiry
 * Generates XLSX with embedded product images + sends email via Resend
 */

// ============ XLSX BUILDER ============
// Simple XLSX generation (BIFF format) without external deps
// Supports: text, numbers, embedded images per row

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Encode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Build XLSX as a ZIP (Office Open XML)
async function buildXlsxWithImages(contact, cart, r2Endpoint) {
  const now = new Date();
  const piNo = 'PI-' + now.getFullYear().toString().slice(-2) + now.toISOString().slice(5,10).replace(/-/g,'') + '-' + String(Math.floor(Math.random()*9999)).padStart(4,'0');
  const dateStr = now.toISOString().slice(0,10);
  const timestamp = now.toISOString();

  // Download images from R2
  const imageDataList = [];
  for (const item of cart) {
    const imgUrls = (item.images && item.images.length > 0) ? item.images : [];
    const downloaded = [];
    for (const url of imgUrls.slice(0, 3)) {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          downloaded.push({
            buffer: buf,
            b64: arrayBufferToBase64(buf),
            ext: url.includes('.png') ? 'png' : 'jpeg'
          });
        }
      } catch(e) {}
    }
    imageDataList.push(downloaded);
  }

  // Build XLSX ZIP content
  const encoder = new TextEncoder();
  const files = {};

  // [Content_Types].xml
  files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/_rels/sheet1.xml.rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
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
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`;

  // xl/worksheets/_rels/sheet1.xml.rels
  const imgRels = imageDataList.map((imgs, i) => {
    return imgs.map((img, j) => {
      const rid = `rId_img_${i}_${j}`;
      const ext = img.ext;
      return `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/img_${i}_${j}.${ext}"/>`;
    }).join('');
  }).join('');
  files['xl/worksheets/_rels/sheet1.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${imgRels}
</Relationships>`;

  // xl/sharedStrings.xml
  const strings = [];
  const strIndex = {};
  function addString(s) {
    const k = String(s);
    if (strIndex[k] !== undefined) return strIndex[k];
    const idx = strings.length;
    strIndex[k] = idx;
    strings.push(k);
    return idx;
  }
  // Add all needed strings
  const HDR_FIELDS = ['No.','Item No.','Image','Product Name','Description','USD Price','Qty','Amount','Cost(CNY)','Unit Size','CTN L','CTN W','CTN H','pcs/CTN','CBM','N.W','G.W'];
  HDR_FIELDS.forEach(s => addString(s));

  const contactStrings = [
    'PROFORMA INVOICE','','','','','','','','','','','','',
    'TO:','ATTN:','TEL:','EMAIL:','COMPANY:','REMARK:',
    'From:','PARTY MAKER','','ATTN:','TEL:','Email:','PI No.',
    'TERMS & CONDITIONS',
    '1. FOB Ningbo/Shanghai.',
    '2. The price does not include any testing, inspection and auditing costs.',
    '3. Production time: 45 days after deposit is received.',
    '4. Payment method: 30% deposit, 70% balance to be paid before the goods leave the factory.',
    '',
    'Bank Information:','BENEFICIARY:','BANK OF NAME:','BANK ADDRESS:','POST CODE:','A/C NO.:','SWIFT CODE:',
    'JIATAO INDUSTRY (SHANGHAI) CO.,LTD','AGRICULTURAL BANK OF CHINA SHANGHAI YANGPU BRANCH',
    'NO. 1128, XIANGYIN ROAD, YANGPU DISTRICT, SHANGHAI CHINA','200433','09421014040006209','ABOCCNBJ090',
    'TOTAL:','','Date:','','Port:','FOB Ningbo/Shanghai'
  ];
  contactStrings.forEach(s => addString(s));

  cart.forEach(item => {
    addString(item.sku || '-');
    addString(item.name || '');
    addString(item.description || '');
  });

  const ssStrings = strings.map(s => {
    const esc = escapeXml(s);
    return `<si><t xml:space="preserve">${esc}</t></si>`;
  }).join('');
  files['xl/sharedStrings.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${ssStrings}</sst>`;

  // xl/styles.xml
  files['xl/styles.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Arial"/></font>
    <font><sz val="16"/><b val="1"/><name val="Arial"/></font>
    <font><sz val="10"/><name val="Arial"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF9CAF88"/></patternFill></fill>
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
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0"><alignment horizontal="center"/></xf>
    <xf numFmtId="2" fontId="0" fillId="0" borderId="1" xfId="0"><alignment horizontal="center"/></xf>
    <xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
  </cellXfs>
</styleSheet>`;

  // xl/theme/theme1.xml
  files['xl/theme/theme1.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="PartyMaker">
  <a:themeElements>
    <a:clrScheme name="PartyMaker">
      <a:dk1><a:srgbClr val="000000"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="7A8B6E"/></a:dk2>
      <a:lt2><a:srgbClr val="F7F9F5"/></a:lt2>
      <a:accent1><a:srgbClr val="9CAF88"/></a:accent1>
      <a:accent2><a:srgbClr val="D4AF37"/></a:accent2>
      <a:accent3><a:srgbClr val="F7E7CE"/></a:accent3>
    </a:clrScheme>
    <a:fontScheme><a:majorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface="Arial"/></a:minorFont></a:fontScheme>
    <a:fmtScheme><a:fillStyleList><a:solidFill><a:schemeClr val="lt1"/></a:solidFill></a:fillStyleList></a:fmtScheme>
  </a:themeElements>
</a:theme>`;

  // xl/workbook.xml
  files['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="PI" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets>
</workbook>`;

  // docProps/core.xml
  files['docProps/core.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">
  <dc:creator>Party Maker</dc:creator>
  <dcterms:created>${timestamp}</dcterms:created>
</cp:coreProperties>`;

  // docProps/app.xml
  files['docProps/app.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Party Maker</Application>
</Properties>`;

  // xl/worksheets/sheet1.xml
  // Layout: header rows 0-6, table header row 7, data rows 8+
  const HDR_ROW = 8;
  const DATA_START = 9;
  const IMG_ROW_HEIGHT = 90; // ~cm
  const NOIMG_ROW_HEIGHT = 20;

  // Column widths: A=No, B=ItemNo, C=Image, D=Name, E=Desc, F=Price, G=Qty, H=Amount, I=Cost, J=UnitSize, K=CTN L, L=CTN W, M=CTN H, N=pcs/CTN, O=CBM, P=N.W, Q=G.W
  const colWidths = [
    [1,4],[2,12],[3,8],[4,30],[5,30],[6,10],[7,8],[8,12],[9,10],
    [10,12],[11,8],[12,8],[13,8],[14,8],[15,8],[16,8],[17,8]
  ].map(([idx,w]) => `<col min="${idx}" max="${idx}" width="${w}" customWidth="1"/>`).join('');

  // Header rows (shared string indices)
  function s(str) { return strIndex[String(str)]; }
  function n(val) { return `<v>${val}</v>`; }

  // Build header section rows 0-6
  const headerRows = [
    {r:0, c:0, v:'PROFORMA INVOICE', style:1, cs:18, rs:1, cs2:16},
    {r:2, c:0, v:'TO:', style:0, cs:1},{r:2, c:6, v:'From:', style:0},{r:2, c:7, v:'PARTY MAKER', style:1},
    {r:3, c:0, v:'ATTN:', style:0},{r:3, c:1, v:contact.name, style:0},{r:3, c:7, v:'ATTN:', style:0},{r:3, c:8, v:'', style:0},
    {r:4, c:0, v:'TEL:', style:0},{r:4, c:1, v:'', style:0},{r:4, c:7, v:'TEL:', style:0},{r:4, c:8, v:'', style:0},
    {r:5, c:0, v:'EMAIL:', style:0},{r:5, c:1, v:contact.email, style:0},{r:5, c:7, v:'Email:', style:0},{r:5, c:8, v:'', style:0},
    {r:6, c:0, v:'COMPANY:', style:0},{r:6, c:1, v:contact.company || '', style:0},{r:6, c:7, v:'REMARK:', style:0},{r:6, c:8, v:contact.country || '', style:0},
  ];

  // Table header row (row HDR_ROW=8)
  const tblHeaders = HDR_FIELDS.map((h, i) => ({
    r: HDR_ROW, c: i, v: h, style: 2
  }));

  // Data rows
  let rowIdx = DATA_START;
  const dataRows = [];
  const imgRefs = []; // {row, col, imgIndex}
  cart.forEach((item, i) => {
    const qty = parseInt(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    const subtotal = qty * price;
    const imgs = imageDataList[i];

    // If has images, reserve 2 rows: one for image, one for text
    const rowsForItem = imgs.length > 0 ? 2 : 1;
    const hasImg = imgs.length > 0;

    dataRows.push(
      {r:rowIdx, c:0, v:i+1, style:3}, // No
      {r:rowIdx, c:1, v:item.sku||'-', style:5}, // Item No
      {r:rowIdx, c:2, v:hasImg ? '' : '', style:0, hasImage:hasImg, imgCount:imgs.length, imgIndex:i}, // Image placeholder
      {r:rowIdx, c:3, v:item.name||'', style:5}, // Name
      {r:rowIdx, c:4, v:item.description||'', style:5}, // Desc
      {r:rowIdx, c:5, v:price, style:4, numFmt:2}, // Price
      {r:rowIdx, c:6, v:qty, style:3}, // Qty
      {r:rowIdx, c:7, v:subtotal, style:4, numFmt:2}, // Amount
      {r:rowIdx, c:8, v:item._costPrice||0, style:4, numFmt:2}, // Cost
      {r:rowIdx, c:9, v:item._unitSize||'', style:5}, // UnitSize
      {r:rowIdx, c:10, v:item._ctnL||0, style:4}, // CTN L
      {r:rowIdx, c:11, v:item._ctnW||0, style:4}, // CTN W
      {r:rowIdx, c:12, v:item._ctnH||0, style:4}, // CTN H
      {r:rowIdx, c:13, v:item._pcsPerCtn||0, style:3}, // pcs/CTN
      {r:rowIdx, c:14, v:item._cbm||0, style:4, numFmt:3}, // CBM
      {r:rowIdx, c:15, v:item._nw||0, style:4, numFmt:3}, // N.W
      {r:rowIdx, c:16, v:item._gw||0, style:4, numFmt:3}, // G.W
    );

    if (hasImg) {
      imgRefs.push({rowIdx, imgIndex:i, imgs, col:2});
      rowIdx += 1; // extra row for text continuation if needed
    }
    rowIdx += 1;
  });

  // Total row
  const totalAmt = cart.reduce((s,item) => s + ((parseInt(item.quantity)||0)*(parseFloat(item.price)||0)), 0);
  const lastRow = rowIdx;
  dataRows.push(
    {r:lastRow, c:6, v:'TOTAL:', style:1},
    {r:lastRow, c:7, v:totalAmt, style:4, numFmt:2, numStyle:1}
  );
  const termsRow = lastRow + 2;
  const bankRow = termsRow + 5;

  // Build sheet XML
  const colLetter = c => String.fromCharCode(65 + c);
  function cellRef(r,c) { return `${colLetter(c)}${r+1}`; }

  let sheetCells = '';

  // Header rows
  headerRows.forEach(({r,c,v,style,cs,cs2}) => {
    const ref = cellRef(r,c);
    if (cs !== undefined) {
      sheetCells += `<row r="${r+1}" spans="1:17" ht="${NOIMG_ROW_HEIGHT}" customHeight="1"><c r="${ref}" s="${style}" t="s"><is><t>${escapeXml(String(v))}</t></is></c>`;
      if (cs2 !== undefined) {
        sheetCells += `<c r="${colLetter(c+1)}${r+1}" s="${style}" t="s"/>`;
      }
      sheetCells += `</row>`;
    } else {
      sheetCells += `<row r="${r+1}" spans="1:17" ht="${NOIMG_ROW_HEIGHT}" customHeight="1"><c r="${ref}" s="${style}" t="s"><is><t>${escapeXml(String(v))}</t></is></c></row>`;
    }
  });

  // Table header row
  sheetCells += `<row r="${HDR_ROW+1}" spans="1:17" ht="${NOIMG_ROW_HEIGHT}" customHeight="1">`;
  tblHeaders.forEach(({r,c,v,style}) => {
    sheetCells += `<c r="${cellRef(r,c)}" s="${style}" t="s"><is><t>${escapeXml(String(v))}</t></is></c>`;
  });
  sheetCells += `</row>`;

  // Data rows
  dataRows.forEach(({r,c,v,style,numFmt,numStyle}) => {
    const ref = cellRef(r,c);
    if (v === '' || v === undefined) {
      sheetCells += `<c r="${ref}" s="${style}" t="s"/>`;
    } else if (typeof v === 'number') {
      const fmtAttr = numFmt !== undefined ? ` s="${numStyle||style}"` : ` s="${style}"`;
      sheetCells += `<c r="${ref}"${fmtAttr}><v>${v}</v></c>`;
    } else {
      sheetCells += `<c r="${ref}" s="${style}" t="s"><is><t>${escapeXml(String(v))}</t></is></c>`;
    }
  });

  // Total row
  sheetCells += `<row r="${lastRow+1}" spans="1:17" ht="${NOIMG_ROW_HEIGHT}" customHeight="1">`;
  for (let c=0;c<17;c++) {
    const d = dataRows.find(x => x.r===lastRow && x.c===c);
    if (d) {
      const ref = cellRef(d.r,d.c);
      if (typeof d.v === 'number') {
        sheetCells += `<c r="${ref}" s="${d.numStyle||d.style}"><v>${d.v}</v></c>`;
      } else {
        sheetCells += `<c r="${ref}" s="${d.style}" t="s"><is><t>${escapeXml(String(d.v))}</t></is></c>`;
      }
    } else {
      sheetCells += `<c r="${cellRef(lastRow,c)}"/>`;
    }
  }
  sheetCells += `</row>`;

  // Terms section
  const termsLines = [
    'TERMS & CONDITIONS','',
    '1. FOB Ningbo/Shanghai.',
    '2. The price does not include any testing, inspection and auditing costs.',
    '3. Production time: 45 days after deposit is received.',
    '4. Payment method: 30% deposit, 70% balance to be paid before the goods leave the factory.',
    ''
  ];
  termsLines.forEach((line, i) => {
    sheetCells += `<row r="${termsRow+i+1}" spans="1:17"><c r="${colLetter(0)}${termsRow+i+1}" t="s"><is><t>${escapeXml(line)}</t></is></c></row>`;
  });

  // Bank info
  const bankLines = [
    'Bank Information:','',
    ['BENEFICIARY:', 'JIATAO INDUSTRY (SHANGHAI) CO.,LTD'],
    ['BANK OF NAME:', 'AGRICULTURAL BANK OF CHINA SHANGHAI YANGPU BRANCH'],
    ['BANK ADDRESS:', 'NO. 1128, XIANGYIN ROAD, YANGPU DISTRICT, SHANGHAI CHINA'],
    ['POST CODE:', '200433'],
    ['A/C NO.:', '09421014040006209'],
    ['SWIFT CODE:', 'ABOCCNBJ090'],
  ];
  let bankR = bankRow;
  bankLines.forEach(line => {
    if (Array.isArray(line)) {
      sheetCells += `<row r="${bankR+1}" spans="1:17">`;
      sheetCells += `<c r="${colLetter(0)}${bankR+1}" t="s"><is><t>${escapeXml(line[0])}</t></is></c>`;
      sheetCells += `<c r="${colLetter(1)}${bankR+1}" t="s"><is><t>${escapeXml(line[1])}</t></is></c>`;
      sheetCells += `</row>`;
    } else {
      sheetCells += `<row r="${bankR+1}" spans="1:17"><c r="${colLetter(0)}${bankR+1}" t="s"><is><t>${escapeXml(line)}</t></is></c></row>`;
    }
    bankR++;
  });

  // Drawing XML for images
  let drawings = '';
  let drawingRels = '';
  let imgCounter = 0;
  imgRefs.forEach(({rowIdx, imgIndex, imgs}) => {
    imgs.slice(0,1).forEach((img, j) => {
      const rid = `rId_img_${imgIndex}_${j}`;
      const anchorCell = cellRef(rowIdx, 2);
      // offset in EMUs (1 inch = 914400 EMU), image size 3x3cm
      drawings += `<dr:mc:Ignorable xmlns:dr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <dr:spPr>
          <a:xfrm><a:off x="0" y="0"/><a:ext cx="2700000" cy="2700000"/></a:xfrm>
          <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        </dr:spPr>
        <dr:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></dr:blipFill>
      </dr:mc:Ignorable>`;
      // Actually use absolute positioning for simplicity
      const imgRid = `rId_img_${imgIndex}_${j}`;
      drawings += `
      <xdr:twoCellAnchor xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">
        <xdr:from><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${rowIdx}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
        <xdr:to><xdr:col>2</xdr:col><xdr:colOff>2700000</xdr:colOff><xdr:row>${rowIdx}</xdr:row><xdr:rowOff>2700000</xdr:rowOff></xdr:to>
        <xdr:pic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <xdr:nvPicPr><xdr:cNvPr id="${imgCounter+1}" name="img_${imgIndex}_${j}"/><xdr:cNvPicPr/></xdr:nvPicPr>
          <xdr:blipFill xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
            <a:blip r:embed="${imgRid}"/><a:stretch><a:fillRect/></a:stretch>
          </xdr:blipFill>
          <xdr:spPr>
            <a:xfrm><a:off x="0" y="0"/><a:ext cx="2700000" cy="2700000"/></a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          </xdr:spPr>
        </xdr:pic>
      </xdr:twoCellAnchor>`;
      imgCounter++;
    });
  });

  const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${drawings}
</xdr:wsDr>`;
  files['xl/worksheets/drawings/drawing1.xml'] = drawingXml;

  // Update sheet1.xml.rels to include drawing
  files['xl/worksheets/_rels/sheet1.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${imgRels}
<Relationship Id="rId_drawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`;

  // Add drawing reference to sheet
  const hasDrawing = imgRefs.length > 0;

  files['xl/worksheets/sheet1.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><selection activeCell="A1" sqref="A1"/></sheetView></sheetViews>
  <cols>${colWidths}</cols>
  <sheetData>${sheetCells}</sheetData>
  ${hasDrawing ? `<drawing r:id="rId_drawing"/>` : ''}
</worksheet>`;

  // Add image files
  imageDataList.forEach((imgs, i) => {
    imgs.slice(0,1).forEach((img, j) => {
      const ext = img.ext;
      files[`xl/media/img_${i}_${j}.${ext}`] = img.buffer;
    });
  });

  // Build ZIP using built-in approach (no external deps)
  const parts = [];
  let offset = 0;
  const cdEntries = [];

  for (const [path, data] of Object.entries(files)) {
    const bytes = data instanceof Uint8Array ? data : (data instanceof ArrayBuffer ? new Uint8Array(data) : new TextEncoder().encode(data));
    const crc = crc32(bytes);
    const size = bytes.length;
    const nameBytes = new TextEncoder().encode(path);

    // Local file header
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);
    parts.push(lh, bytes);

    // Central directory entry
    const cd = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(cd.buffer);
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

  // End of central directory
  const cdOffset = offset;
  const cdTotal = cdEntries.reduce((a, e) => a + e.length, 0);
  let eocd = new Uint8Array(22);
  const eocdv = new DataView(eocd.buffer);
  eocdv.setUint32(0, 0x06054b50, true);
  eocdv.setUint16(4, 0, true);
  eocdv.setUint16(6, 0, true);
  eocdv.setUint16(8, 0, true);
  eocdv.setUint16(10, 0, true);
  eocdv.setUint32(12, cdTotal, true);
  eocdv.setUint32(16, cdTotal, true);
  eocdv.setUint32(20, cdOffset, true);
  eocdv.setUint16(24, 0, true);

  const allParts = [...parts, ...cdEntries, eocd];
  const totalLen = allParts.reduce((a, b) => a + b.length, 0);
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of allParts) { result.set(p, pos); pos += p.length; }
  return { blob: result.buffer, piNo };
}

// CRC32 table
const CRC_TABLE = (function() {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();
function crc32(data) {
  let crc = 0xFFFFFFFF;
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ============ EMAIL ============
function buildEmailHtml(contact, cart) {
  const total = cart.reduce((sum, item) => sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.price) || 0)), 0);
  const rows = cart.map((item, i) => {
    const qty = parseInt(item.quantity) || 0;
    const price = parseFloat(item.price) || 0;
    const subtotal = qty * price;
    const imgTag = (item.images && item.images[0]) ? `<img src="${item.images[0]}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;"/>` : '';
    return `<tr>
      <td style="padding:8px;border-bottom:1px solid #D9E0D1;text-align:center;">${i+1}</td>
      <td style="padding:8px;border-bottom:1px solid #D9E0D1;">${escapeHtml(item.sku||'-')}</td>
      <td style="padding:8px;border-bottom:1px solid #D9E0D1;text-align:center;">${imgTag}</td>
      <td style="padding:8px;border-bottom:1px solid #D9E0D1;">${escapeHtml(item.name||'')}</td>
      <td style="padding:8px;border-bottom:1px solid #D9E0D1;text-align:center;">${qty}</td>
      <td style="padding:8px;border-bottom:1px solid #D9E0D1;text-align:right;">$${price.toFixed(2)}</td>
      <td style="padding:8px;border-bottom:1px solid #D9E0D1;text-align:right;font-weight:600;color:#7A8B6E;">$${subtotal.toFixed(2)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:20px;">
  <div style="background:#9CAF88;color:white;padding:28px 24px;border-radius:12px 12px 0 0;">
    <h1 style="margin:0;font-size:1.6rem;font-weight:700;">🎉 New Product Inquiry</h1>
    <p style="margin:6px 0 0;opacity:0.9;">From Party Maker Website</p>
  </div>
  <div style="background:#F7F9F5;padding:20px 24px;border:1px solid #D9E0D1;border-top:none;">
    <h2 style="font-size:0.95rem;color:#7A8B6E;margin:0 0 12px;font-weight:600;">Contact Information</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.88rem;color:#333;">
      <div><strong>Name:</strong> ${escapeHtml(contact.name||'-')}</div>
      <div><strong>Email:</strong> <a href="mailto:${escapeHtml(contact.email||'')}" style="color:#9CAF88;">${escapeHtml(contact.email||'-')}</a></div>
      <div><strong>Company:</strong> ${escapeHtml(contact.company||'-')}</div>
      <div><strong>Country:</strong> ${escapeHtml(contact.country||'-')}</div>
    </div>
    ${contact.message ? `<div style="margin-top:10px;font-size:0.88rem;color:#333;"><strong>Message:</strong> ${escapeHtml(contact.message)}</div>` : ''}
  </div>
  <div style="padding:20px 24px;">
    <h2 style="font-size:0.95rem;color:#7A8B6E;margin:0 0 12px;font-weight:600;">Selected Products (${cart.length} items)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:0.88rem;background:white;border-radius:8px;overflow:hidden;">
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
          <td colspan="6" style="padding:12px 8px;text-align:right;font-weight:700;font-size:1rem;color:#7A8B6E;">TOTAL:</td>
          <td style="padding:12px 8px;text-align:right;font-weight:700;font-size:1rem;color:#D4AF37;">$${total.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
    <p style="margin-top:14px;font-size:0.82rem;color:#8A9A7A;">
      📎 <em>A Proforma Invoice (PI) Excel file with product images is attached. Download and use it directly.</em>
    </p>
  </div>
  <div style="background:#7A8B6E;color:#F7F9F5;padding:16px 24px;border-radius:0 0 12px 12px;font-size:0.78rem;text-align:center;">
    <p style="margin:0;">Party Maker Website | ${new Date().toLocaleDateString()}</p>
  </div>
</body>
</html>`;
}

// ============ MAIN HANDLER ============
export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await context.request.json();
    const { contact, cart } = body;

    if (!contact?.email || !contact?.name) {
      return new Response(JSON.stringify({ error: 'Missing name and email' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (!cart?.length) {
      return new Response(JSON.stringify({ error: 'Cart is empty' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const resendApiKey = context.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Email not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const r2Endpoint = 'https://cdd100719805df54e62bee48d165b2dd.r2.cloudflarestorage.com/party-maker';

    // Build XLSX with images
    const { blob: xlsxBlob, piNo } = await buildXlsxWithImages(contact, cart, r2Endpoint);
    const xlsxBuffer = await xlsxBlob.arrayBuffer();
    const xlsxBase64 = arrayBufferToBase64(xlsxBuffer);

    const emailHtml = buildEmailHtml(contact, cart);

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Party Maker <info@partymaker.cn>',
        to: ['info@partymaker.cn'],
        subject: `📩 Inquiry from ${contact.name} - ${cart.length} products - ${piNo}`,
        html: emailHtml,
        attachments: [{
          filename: `${piNo}.xlsx`,
          content: xlsxBase64,
        }],
      }),
    });

    const result = await resendResp.json();
    if (!resendResp.ok) {
      console.error('Resend error:', result);
      return new Response(JSON.stringify({ error: 'Failed to send email', detail: result.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Inquiry sent',
      emailId: result.id,
      piNo,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    console.error('Handler error:', err);
    return new Response(JSON.stringify({ error: 'Internal error', detail: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
