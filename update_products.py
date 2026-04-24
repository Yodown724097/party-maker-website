"""
产品数据更新脚本
功能：
1. 读取上传的Excel文件（产品数据 + 删除列表）
2. 按SKU匹配现有products.json
3. 覆盖更新/新增/删除
4. 生成新的products.json
5. 内嵌到index.html
6. 推送到GitHub
"""
import json
import sys
import os
import pandas as pd
from openpyxl import load_workbook
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

# ============ 配置 ============
PRODUCTS_JSON_PATH = r'C:\Users\Administrator\WorkBuddy\20260423091746\party-maker-website\products.json'
INDEX_HTML_PATH = r'C:\Users\Administrator\WorkBuddy\20260423091746\party-maker-website\index.html'
WORKSPACE = r'C:\Users\Administrator\WorkBuddy\20260423091746'

# Excel列名映射（中文表头 → 英文字段）
COLUMN_MAP = {
    'ID/SKU': 'id',
    'Product Name': 'name',
    'Price (USD)': 'price',
    'Theme': 'theme',
    'Subcategory': 'subcategory',
    'Description': 'description',
    'Images URLs': 'images',
    'Tags': 'tags',  # ← 新增Tags字段
    'Cost Price (CNY)': '_costPrice',
    'Cost Note': '_costNote',
    'Order No': '_orderNo',
    'Stock Qty': '_stockQty',
    'Unit Size': '_unitSize',
    'CTN Length (cm)': '_ctnL',
    'CTN Width (cm)': '_ctnW',
    'CTN Height (cm)': '_ctnH',
    'pcs/CTN': '_pcsPerCtn',
    'CBM': '_cbm',
    'N.W (kg)': '_nw',
    'G.W (kg)': '_gw',
}


def read_excel(excel_path):
    """读取Excel文件，返回产品列表和删除SKU列表"""
    print(f"\n📖 读取Excel: {excel_path}")

    # 读取主数据表
    df = pd.read_excel(excel_path, sheet_name='产品数据')
    print(f"   产品数据行数: {len(df)}")

    # 读取删除列表（如果有）
    delete_skus = set()
    try:
        df_delete = pd.read_excel(excel_path, sheet_name='删除列表')
        if 'SKU' in df_delete.columns or 'ID/SKU' in df_delete.columns:
            col = 'SKU' if 'SKU' in df_delete.columns else 'ID/SKU'
            delete_skus = set(df_delete[col].dropna().astype(str).str.strip())
            print(f"   删除列表SKU数: {len(delete_skus)}")
    except Exception as e:
        print(f"   无删除列表Sheet（或为空）")

    return df, delete_skus


def df_to_product(row):
    """将DataFrame行转换为产品对象"""
    product = {}

    for col, field in COLUMN_MAP.items():
        if col in row.index:
            val = row[col]

            # 处理空值和NaN
            if pd.isna(val) or str(val).strip() in ['', 'nan', 'None']:
                val = '' if field != '_stockQty' else 0
            else:
                val = str(val).strip()

            # 类型转换
            if field == 'price':
                try:
                    val = float(val) if val else 0
                except:
                    val = 0
            elif field == '_costPrice':
                try:
                    val = float(val) if val else 0
                except:
                    val = 0
            elif field in ['_ctnL', '_ctnW', '_ctnH', '_pcsPerCtn', '_cbm', '_nw', '_gw', '_stockQty']:
                try:
                    val = float(val) if val else 0
                except:
                    val = 0
            elif field == 'images':
                # 图片URL处理：分号分隔的字符串转数组
                val = [url.strip() for url in val.split(';') if url.strip()] if val else []
            elif field == 'tags':
                # Tags处理：逗号分隔的字符串转数组
                val = [t.strip().lower() for t in val.split(',') if t.strip()] if val else []

            product[field] = val

    return product


def merge_products(existing_products, new_products, delete_skus):
    """合并产品数据"""
    print("\n🔄 合并产品数据...")

    # 按SKU建立现有产品的索引
    product_dict = {p['id']: p for p in existing_products}
    original_count = len(product_dict)

    stats = {'updated': 0, 'added': 0, 'deleted': 0}

    # 处理新产品数据
    for product in new_products:
        sku = product.get('id', '')
        if not sku:
            continue

        if sku in product_dict:
            # 存在 → 覆盖更新（保留images字段，因为它在原数据中可能有多个）
            old_images = product_dict[sku].get('images', [])
            product_dict[sku] = product.copy()
            if old_images and not product.get('images'):
                product_dict[sku]['images'] = old_images
            stats['updated'] += 1
        else:
            # 不存在 → 新增
            product_dict[sku] = product
            stats['added'] += 1

    # 处理删除列表
    for sku in delete_skus:
        if sku in product_dict:
            del product_dict[sku]
            stats['deleted'] += 1

    result = list(product_dict.values())

    print(f"   原始产品数: {original_count}")
    print(f"   更新: {stats['updated']}")
    print(f"   新增: {stats['added']}")
    print(f"   删除: {stats['deleted']}")
    print(f"   最终产品数: {len(result)}")

    return result, stats


def save_products_json(products, output_path):
    """保存products.json"""
    # 构建数据结构
    data = {
        'products': products,
        'themes': list(set(p.get('theme', '') for p in products if p.get('theme'))),
        'categories': list(set(p.get('subcategory', '') for p in products if p.get('subcategory'))),
        'lastUpdated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n💾 保存products.json: {len(products)}个产品")


def inline_to_html(products_json_path, index_html_path):
    """将产品数据内嵌到index.html"""
    print("\n📝 内嵌产品数据到index.html...")

    with open(products_json_path, 'r', encoding='utf-8') as f:
        products_data = json.load(f)

    with open(index_html_path, 'r', encoding='utf-8') as f:
        html = f.read()

    products = products_data if isinstance(products_data, list) else products_data.get('products', [])

    # 替换 allProducts
    old_init = 'let allProducts = [];'
    new_init = 'let allProducts = ' + json.dumps(products, ensure_ascii=False) + ';'

    if old_init in html:
        html = html.replace(old_init, new_init, 1)
        print("   allProducts 替换成功")
    else:
        print("   ⚠️ 未找到 allProducts = []，跳过")
        return False

    # 替换 loadProducts 函数
    old_fn = """    // ============ LOAD PRODUCTS ============
    async function loadProducts() {
        try {
            const resp = await fetch(R2_PRODUCTS_URL);
            if (!resp.ok) throw new Error('Failed');
            const data = await resp.json();
            allProducts = Array.isArray(data) ? data : (data.products || []);
            buildCategoryList();
            filterAndRender();
        } catch (err) {
            document.getElementById('productsGrid').innerHTML = `
                <div style="text-align:center;padding:4rem 1rem;color:var(--text-light);">
                    <svg width="48" height="48" style="margin-bottom:1rem;color:var(--text-light)"><use href="#icon-package"/></svg>
                    <p>Unable to load products. Please refresh.</p>
                </div>`;
        }
    }"""

    new_fn = """    // ============ LOAD PRODUCTS (embedded) ============
    function loadProducts() {
        buildCategoryList();
        filterAndRender();
    }"""

    if old_fn in html:
        html = html.replace(old_fn, new_fn)
        print("   loadProducts 替换成功")
    else:
        print("   ⚠️ 未找到 loadProducts 函数，尝试备用替换")
        idx = html.find('async function loadProducts')
        if idx >= 0:
            end_idx = html.find('function buildCategoryList', idx)
            if end_idx >= 0:
                html = html[:idx] + new_fn + '\n\n    ' + html[end_idx:]
                print("   loadProducts 备用替换成功")

    with open(index_html_path, 'w', encoding='utf-8') as f:
        f.write(html)

    print("   index.html 保存成功")
    return True


def git_push(message="chore: update products"):
    """推送到GitHub"""
    print("\n🚀 推送到GitHub...")

    os.chdir(os.path.dirname(PRODUCTS_JSON_PATH))

    os.system('git add -A')
    os.system(f'git commit -m "{message}"')
    result = os.system('git push')

    if result == 0:
        print("   ✅ 推送成功！")
        print("   ⏳ Cloudflare Pages 部署中（约1-2分钟）")
    else:
        print("   ❌ 推送失败")

    return result == 0


def main():
    if len(sys.argv) < 2:
        print("""
用法: python update_products.py <Excel文件路径>

示例: python update_products.py "C:/Users/Administrator/Downloads/产品数据更新.xlsx"
""")
        return

    excel_path = sys.argv[1]

    if not os.path.exists(excel_path):
        print(f"❌ 文件不存在: {excel_path}")
        return

    # 1. 读取Excel
    df, delete_skus = read_excel(excel_path)

    # 2. 转换为产品列表
    new_products = [df_to_product(row) for _, row in df.iterrows() if pd.notna(row.get('ID/SKU'))]
    print(f"   有效产品: {len(new_products)}")

    # 3. 读取现有products.json
    print(f"\n📂 读取现有products.json...")
    with open(PRODUCTS_JSON_PATH, 'r', encoding='utf-8') as f:
        existing_data = json.load(f)

    existing_products = existing_data if isinstance(existing_data, list) else existing_data.get('products', [])
    print(f"   现有产品数: {len(existing_products)}")

    # 4. 合并数据
    merged_products, stats = merge_products(existing_products, new_products, delete_skus)

    # 5. 保存products.json
    save_products_json(merged_products, PRODUCTS_JSON_PATH)

    # 6. 内嵌到index.html
    inline_to_html(PRODUCTS_JSON_PATH, INDEX_HTML_PATH)

    # 7. Git推送
    timestamp = datetime.now().strftime('%m%d %H:%M')
    msg = f"chore: update products ({timestamp}) | +{stats['added']} -{stats['deleted']} ~{stats['updated']}"
    git_push(msg)

    print("\n" + "="*50)
    print("✅ 产品更新完成！")
    print(f"   网站: https://party-maker-website.pages.dev")
    print("="*50)


if __name__ == '__main__':
    main()
