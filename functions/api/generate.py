"""
Cloudflare Pages Function - PI Excel Generator
流程: 生成Excel → 直接POST给VPS → VPS发邮件
VPS只做SMTP转发（极简）
"""
import json
import base64
import io
import random
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

VPS_TRIGGER_URL = "https://api.partymaker.cn/trigger-mail"
TRIGGER_KEY = "pm-trigger-2026"


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

    # ===== 生成Excel =====
    excel_buffer = generate_excel(contact, cart, pi_no, now)
    excel_bytes = excel_buffer.getvalue()
    excel_b64 = base64.b64encode(excel_bytes).decode('utf-8')

    # ===== 直接发邮件触发到VPS（Excel数据内嵌在POST里，不经过R2） =====
    mail_result = None
    if send_email_flag:
        mail_payload = {
            'pi_no': pi_no,
            'excel_b64': excel_b64,
            'contact': contact,
            'cart': cart,
            'total': sum((int(i.get('quantity', 0) or 0)) * (float(i.get('price', 0) or 0)) for i in cart)
        }
        mail_result = notify_vps(mail_payload)

    return json_response({
        'success': True,
        'piNo': pi_no,
        'emailSent': mail_result.get('sent') if mail_result else None,
        'message': mail_result.get('error', 'Success') if mail_result else 'Email skipped',
        'excel': excel_b64,
    })


def notify_vps(payload):
    """POST Excel数据到VPS触发邮件发送"""
    import urllib.request
    import urllib.error

    req = urllib.request.Request(
        VPS_TRIGGER_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            "Content-Type": "application/json",
            "X-Trigger-Key": TRIGGER_KEY
        },
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read())
            return {'sent': result.get('success', False), 'details': result}
    except urllib.error.HTTPError as e:
        return {'sent': False, 'error': f'HTTP {e.code}'}
    except Exception as e:
        return {'sent': False, 'error': str(e)}


def upload_to_r2(api_token, key, data):
    """Upload file to R2 using S3-compatible API"""
    # R2 uses S3-compatible API
    # endpoint: https://<account_id>.r2.dev
    import urllib.request

    endpoint = f"https://{R2_ACCOUNT_ID}.r2.dev/{key}"

    # Use PUT request with R2 API token
    req = urllib.request.Request(
        endpoint,
        data=data,
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        method="PUT"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status in (200, 201)
    except Exception as e:
        print(f"R2 upload error: {e}")
        return False


def notify_vps(payload):
    """通知VPS下载Excel并发送邮件"""
    import urllib.request
    import urllib.error

    req = urllib.request.Request(
        VPS_TRIGGER_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            "Content-Type": "application/json",
            "X-Trigger-Key": "pm-trigger-2026"  # Simple auth
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            return {'sent': True, 'details': result}
    except urllib.error.HTTPError as e:
        return {'sent': False, 'error': f'HTTP {e.code}'}
    except Exception as e:
        return {'sent': False, 'error': str(e)}


def generate_excel(contact, cart, pi_no, now):
    """Generate Proforma Invoice Excel"""
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


def build_email_html(contact, cart, pi_no, total):
    """Build plain-text summary email"""
    rows = ""
    for i, item in enumerate(cart, 1):
        qty = int(item.get('quantity', 0) or 0)
        price = float(item.get('price', 0) or 0)
        cost = float(item.get('_costPrice', 0) or 0)
        img = ((item.get('images') or [''])[0] or '') if item.get('images') else ''
        unit_size = item.get('_unitSize', '')
        if str(unit_size) in ['nan', None, '', 'None']:
            unit_size = '-'
        cbm = item.get('_cbm', '-')
        nw = item.get('_nw', '-')
        gw = item.get('_gw', '-')

        rows += f"""
{i}. SKU: {item.get('sku', item.get('id', '-'))}
   Product: {item.get('name', '')}
   Qty: {qty} | Price: ${price:.2f} | Subtotal: ${qty*price:.2f}
   Cost: {'¥' + str(cost) if cost else '-'} | Size: {unit_size}
   CBM: {cbm} | N.W: {nw}kg | G.W: {gw}kg
   Image: {img}
"""

    return f"""========== 询盘通知 / INQUIRY ==========
PI No.: {pi_no}
时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}

客户信息 / CONTACT
--------------------------
Name: {contact.get('name', '-')}
Company: {contact.get('company', '-')}
Email: {contact.get('email', '-')}
Country: {contact.get('country', '-')}
Phone: {contact.get('phone', '-')}
{f"Remark: {contact.get('message', '')}" if contact.get('message') else ''}

产品清单 / PRODUCTS ({len(cart)} items)
--------------------------
{rows}
=========================================
TOTAL: ${total:.2f}

📎 Excel附件见邮件上方。
由 Party Maker 网站自动发送
"""


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
