"""Cloudflare Pages Function - PI Excel Generator v2
部署到: party-maker-website/pages/api/generate.js
功能: 接收询盘数据 → 生成Excel → 通过Resend发送邮件
"""
import json
import base64
import io
import random
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

SMTP_SERVER = 'smtp.qiye.aliyun.com'
SMTP_PORT = 465
SMTP_USER = 'info@partymaker.cn'
SMTP_PASS = 'JT.info1805'
FROM_EMAIL = 'info@partymaker.cn'

def generate_pi_no():
    now = datetime.now()
    return f'PI-{str(now.year)[-2:]}{now.strftime("%m%d")}-{random.randint(1000, 9999)}'

def get_cell_letter(col_idx):
    result = ''
    while col_idx > 0:
        col_idx, remainder = divmod(col_idx - 1, 26)
        result = chr(65 + remainder) + result
    return result

def on_request(request, env):
    """Handle incoming requests"""
    if request.method == 'OPTIONS':
        return cors_response()
    if request.method != 'POST':
        return json_response({'error': 'Method not allowed'}, status=405)

    try:
        body = request.json
    except:
        return json_response({'error': 'Invalid JSON'}, status=400)

    contact = body.get('contact', {})
    cart = body.get('cart', [])
    send_email_flag = body.get('send_email', True)

    if not contact.get('name') or not contact.get('email'):
        return json_response({'error': 'Missing name/email'}, status=400)
    if not cart:
        return json_response({'error': 'Cart is empty'}, status=400)

    now = datetime.now()
    pi_no = generate_pi_no()
    excel_buffer = generate_excel(contact, cart, pi_no, now)
    excel_b64 = base64.b64encode(excel_buffer.getvalue()).decode('utf-8')

    email_result = None
    if send_email_flag:
        html = build_email_html(contact, cart, pi_no, now)
        email_result = send_email_via_resend(env, contact, html, excel_b64, pi_no)

    return json_response({
        'success': True,
        'piNo': pi_no,
        'emailId': email_result.get('id', '') if email_result else None,
        'excel': excel_b64,
        'message': 'Email sent' if email_result else 'Email skipped'
    })


def generate_excel(contact, cart, pi_no, now):
    wb = Workbook()
    ws = wb.active
    ws.title = "Proforma Invoice"

    sage_green = PatternFill(start_color="FF9CAF88", end_color="FF9CAF88", fill_type="solid")
    center = Alignment(horizontal='center', vertical='center', wrap_text=True)
    left = Alignment(horizontal='left', vertical='center', wrap_text=True)
    right = Alignment(horizontal='right', vertical='center')

    header_font = Font(name='Arial', size=10, bold=True, color='FFFFFFFF')
    title_font = Font(name='Arial', size=16, bold=True)
    normal_font = Font(name='Arial', size=10)
    bold_font = Font(name='Arial', size=11, bold=True)

    thin = Side(style='thin', color='FF000000')
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    # 标题
    ws.merge_cells('A1:L1')
    ws['A1'] = 'PROFORMA INVOICE'
    ws['A1'].font = title_font
    ws['A1'].alignment = center
    ws.row_dimensions[1].height = 30

    # 发货人/收货人
    ws['A2'] = 'TO:'; ws['B2'] = contact.get('company', '')
    ws['G2'] = 'From:'; ws['H2'] = 'PARTY MAKER'
    ws['A3'] = 'ATTN:'; ws['B3'] = contact.get('name', '')
    ws['G3'] = 'ATTN:'; ws['H3'] = ''
    ws['A4'] = 'TEL:'; ws['B4'] = contact.get('phone', '')
    ws['G4'] = 'TEL:'; ws['H4'] = '+86-572-222222'
    ws['A5'] = 'EMAIL:'; ws['B5'] = contact.get('email', '')
    ws['G5'] = 'Email:'; ws['H5'] = 'info@partymaker.cn'
    ws['A6'] = 'COUNTRY:'; ws['B6'] = contact.get('country', '')
    ws['A7'] = 'REMARK:'; ws['B7'] = (contact.get('message', '') or '')[:100]
    ws['G7'] = 'PI No.'; ws['H7'] = pi_no

    for row in range(2, 8):
        for col in ['A', 'B', 'G', 'H']:
            ws[f'{col}{row}'].font = normal_font

    ws.row_dimensions[2].height = 20
    ws.row_dimensions[7].height = 20

    # 表头
    headers = [
        ('No.', 5), ('Item No.', 12), ('Image', 9.375), ('Product Name', 30),
        ('Description', 25), ('USD Price', 10), ('Qty', 8), ('Amount', 12),
        ('Cost(CNY)', 10), ('Unit Size', 12), ('Unit Weight', 10), ('Inner Size', 12),
    ]
    row = 9
    header_row = row
    for col_idx, (header, width) in enumerate(headers, 1):
        cl = get_cell_letter(col_idx)
        cell = ws.cell(row=row, column=col_idx, value=header)
        cell.font = header_font; cell.fill = sage_green
        cell.alignment = center; cell.border = border
        ws.column_dimensions[cl].width = width
    ws.row_dimensions[row].height = 22
    row += 1

    # 产品数据
    total = 0
    for i, item in enumerate(cart, 1):
        qty = int(item.get('quantity', 0) or 0)
        price = float(item.get('price', 0) or 0)
        amount = qty * price
        total += amount
        sku = item.get('sku', item.get('id', '-'))
        name = item.get('name', '')
        desc = (item.get('description', '') or '').replace('\n', ' ')
        cost_price = float(item.get('_costPrice', 0) or 0)
        unit_size = item.get('_unitSize', '')
        if str(unit_size) in ['nan', None, '', 'None']:
            unit_size = ''

        images = item.get('images', [])
        img_url = (images[0] if images and isinstance(images, list) and images[0] else '')

        ws.cell(row=row, column=1, value=i).alignment = center
        ws.cell(row=row, column=2, value=sku).alignment = center
        ws.cell(row=row, column=4, value=name).alignment = left
        ws.cell(row=row, column=5, value=desc).alignment = left
        c = ws.cell(row=row, column=6, value=price)
        c.number_format = '$#,##0.00'; c.alignment = right
        ws.cell(row=row, column=7, value=qty).alignment = center
        c = ws.cell(row=row, column=8, value=f'=F{row}*G{row}')
        c.number_format = '$#,##0.00'; c.alignment = right
        c = ws.cell(row=row, column=9, value=cost_price if cost_price > 0 else '')
        c.number_format = '¥#,##0.00'; c.alignment = right
        ws.cell(row=row, column=10, value=unit_size).alignment = center
        ws.cell(row=row, column=11, value='').alignment = center
        ws.cell(row=row, column=12, value='').alignment = center

        # 图片超链接
        if img_url:
            c = ws.cell(row=row, column=3)
            c.value = img_url; c.hyperlink = img_url
            c.font = Font(name='Arial', size=9, color='FF0563C1', underline='single')
            c.alignment = center
        else:
            ws.cell(row=row, column=3, value='-').alignment = center

        for col in range(1, 13):
            cell = ws.cell(row=row, column=col)
            cell.font = normal_font; cell.border = border
        ws.row_dimensions[row].height = 55
        row += 1

    # 总计行
    ws.merge_cells(f'A{row}:E{row}')
    ws.cell(row=row, column=1, value="TOTAL:").font = bold_font
    ws.cell(row=row, column=1).alignment = right
    c = ws.cell(row=row, column=8, value=f'=SUM(H{header_row+1}:H{row-1})')
    c.number_format = '$#,##0.00'; c.font = bold_font; c.alignment = right
    for col in range(1, 13):
        ws.cell(row=row, column=col).border = border
    ws.row_dimensions[row].height = 22
    row += 2

    # Terms
    ws.cell(row=row, column=1, value="TERMS & CONDITIONS").font = bold_font
    row += 1
    for term in [
        "1. FOB Ningbo / Shanghai",
        "2. Price does not include testing, inspection and auditing costs",
        "3. Production time: 45 days after deposit is received",
        "4. Payment: 30% deposit, 70% balance before goods leave factory",
    ]:
        ws.cell(row=row, column=1, value=term).font = normal_font
        row += 1

    # Bank
    row += 1
    ws.cell(row=row, column=1, value="BANK INFORMATION").font = bold_font
    row += 1
    for label, val in [
        ("BENEFICIARY:", "JIATAO INDUSTRY (SHANGHAI) CO.,LTD"),
        ("BANK NAME:", "AGRICULTURAL BANK OF CHINA SHANGHAI YANGPU BRANCH"),
        ("BANK ADDRESS:", "NO.1128, XIANGYIN ROAD, YANGPU DISTRICT, SHANGHAI CHINA"),
        ("POST CODE:", "200433"),
        ("A/C NO.:", "09421014040006209"),
        ("SWIFT CODE:", "ABOCCNBJ090"),
    ]:
        ws.cell(row=row, column=1, value=label).font = bold_font
        ws.cell(row=row, column=2, value=val).font = normal_font
        row += 1

    # 签名
    row += 2
    ws.cell(row=row, column=1, value="BUYER SIGNATURE:").font = bold_font
    ws.cell(row=row, column=6, value="SELLER SIGNATURE:").font = bold_font
    row += 2
    ws.merge_cells(f'A{row}:D{row}')
    ws[f'A{row}'] = '_________________________'
    ws.merge_cells(f'F{row}:I{row}')
    ws[f'F{row}'] = '_________________________'

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer


def build_email_html(contact, cart, pi_no, now):
    total = sum((int(i.get('quantity', 0) or 0)) * (float(i.get('price', 0) or 0)) for i in cart)
    rows = ""
    for idx, item in enumerate(cart, 1):
        qty = int(item.get('quantity', 0) or 0)
        price = float(item.get('price', 0) or 0)
        cost = float(item.get('_costPrice', 0) or 0)
        img = ((item.get('images') or [''])[0] or '') if item.get('images') else ''
        sku = item.get('sku', item.get('id', '-'))
        name = item.get('name', '')
        rows += f"""<tr>
            <td style="padding:10px;border-bottom:1px solid #ddd;text-align:center;">{idx}</td>
            <td style="padding:10px;border-bottom:1px solid #ddd;text-align:center;font-weight:bold;">{sku}</td>
            <td style="padding:10px;border-bottom:1px solid #ddd;"><a href="{img}" style="color:#0563C1;font-size:11px;">View Image</a></td>
            <td style="padding:10px;border-bottom:1px solid #ddd;">{name}</td>
            <td style="padding:10px;border-bottom:1px solid #ddd;text-align:center;">{qty}</td>
            <td style="padding:10px;border-bottom:1px solid #ddd;text-align:right;">${price:.2f}</td>
            <td style="padding:10px;border-bottom:1px solid #ddd;text-align:right;font-weight:bold;">${qty*price:.2f}</td>
            <td style="padding:10px;border-bottom:1px solid #ddd;text-align:right;">{'¥'+str(cost) if cost else '-'}</td>
        </tr>"""

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:Arial;max-width:720px;margin:0 auto;padding:20px;background:#f5f5f5;">
    <div style="background:#9CAF88;color:white;padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;">【询盘通知】New Product Inquiry</h1>
        <p style="margin:8px 0 0;opacity:0.9;">PI No.: {pi_no} | {now.strftime('%Y-%m-%d %H:%M')}</p>
    </div>
    <div style="background:white;padding:20px;border:1px solid #ddd;">
        <h2 style="margin:0 0 12px;color:#666;font-size:14px;border-bottom:1px solid #ddd;padding-bottom:8px;">Contact / 联系方式</h2>
        <p><strong>Name:</strong> {contact.get('name', '-')}</p>
        <p><strong>Email:</strong> <a href="mailto:{contact.get('email','')}">{contact.get('email', '-')}</a></p>
        <p><strong>Company:</strong> {contact.get('company', '-')}</p>
        <p><strong>Country:</strong> {contact.get('country', '-')}</p>
        <p><strong>Phone:</strong> {contact.get('phone', '-')}</p>
        {f"<p><strong>Remark:</strong> {contact.get('message','')}</p>" if contact.get('message') else ''}
    </div>
    <div style="background:white;padding:20px;border:1px solid #ddd;border-top:none;">
        <h2 style="margin:0 0 12px;color:#666;font-size:14px;">Products / 产品清单 ({len(cart)} items)</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="background:#9CAF88;color:white;">
                <th style="padding:10px;text-align:center;">#</th>
                <th style="padding:10px;text-align:center;">SKU</th>
                <th style="padding:10px;text-align:center;">Image</th>
                <th style="padding:10px;text-align:left;">Product</th>
                <th style="padding:10px;text-align:center;">Qty</th>
                <th style="padding:10px;text-align:right;">Price</th>
                <th style="padding:10px;text-align:right;">Subtotal</th>
                <th style="padding:10px;text-align:right;">Cost</th>
            </tr></thead>
            <tbody>{rows}</tbody>
            <tfoot><tr style="background:#F7F9F5;">
                <td colspan="6"></td>
                <td style="padding:10px;text-align:right;font-weight:bold;">TOTAL: ${total:.2f}</td>
                <td></td>
            </tr></tfoot>
        </table>
        <p style="font-size:12px;color:#666;margin-top:12px;">📎 Excel PI附件见邮件上方。</p>
    </div>
    <div style="text-align:center;font-size:12px;color:#999;margin-top:16px;">
        Sent via <a href="https://party-maker-website.pages.dev" style="color:#9CAF88;">Party Maker</a>
    </div>
</body></html>"""


def send_email_via_resend(env, contact, html, excel_b64, pi_no):
    url = "https://api.resend.com/emails"
    to_emails = [env.get("EMAIL_TO", "724097@qq.com")]
    customer = contact.get('email', '')
    if customer:
        to_emails.append(customer)

    payload = {
        "from": "Party Maker <onboarding@resend.dev>",
        "to": to_emails,
        "subject": f"【询盘通知】New Inquiry from {contact.get('name', 'Unknown')} - {pi_no}",
        "html": html,
        "attachments": [{"filename": f"{pi_no}.xlsx", "content": excel_b64}]
    }

    from urllib.request import Request, urlopen
    req = Request(url, data=json.dumps(payload).encode(),
                  headers={"Authorization": f"Bearer {env.get('RESEND_API_KEY')}",
                           "Content-Type": "application/json"}, method='POST')
    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception as e:
        raise Exception(f"Resend error: {str(e)}")


def json_response(data, status=200):
    from urllib.request import Response
    body = json.dumps(data).encode()
    headers = {"Content-Type": "application/json",
               "Access-Control-Allow-Origin": "*",
               "Access-Control-Allow-Methods": "POST, OPTIONS",
               "Access-Control-Allow-Headers": "Content-Type"}
    return Response(body, status=status, headers=headers)


def cors_response():
    from urllib.request import Response
    headers = {"Access-Control-Allow-Origin": "*",
               "Access-Control-Allow-Methods": "POST, OPTIONS",
               "Access-Control-Allow-Headers": "Content-Type"}
    return Response(b'', status=204, headers=headers)
