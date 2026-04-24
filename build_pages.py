#!/usr/bin/env python3
"""
build_pages.py — Static HTML page generator for Party Maker SEO
Reads products.json → generates product pages, category pages, sitemap, and products-public.json
Usage: python build_pages.py [--demo]   (demo mode generates only 3 product pages for testing)
"""

import json
import os
import re
import html
from datetime import datetime, timezone
from pathlib import Path

# ========== CONFIG ==========
SITE_URL = "https://www.partymaker.cn"
SITE_NAME = "Party Maker"
SITE_DESC = "Wholesale celebration products from Yiwu factory, China. Ramadan, Eid, Diwali, Easter, New Year. No MOQ spot goods. Custom from 600 pcs. Custom packaging. Global shipping."
WEBSITE_DIR = Path(__file__).parent  # party-maker-website/
PRODUCTS_JSON = WEBSITE_DIR / "products.json"
PUBLIC_JSON = WEBSITE_DIR / "products-public.json"
SITEMAP_FILE = WEBSITE_DIR / "sitemap.xml"
ROBOTS_FILE = WEBSITE_DIR / "robots.txt"

# Only _costPrice is truly internal; packaging specs are useful for buyers
INTERNAL_FIELDS = ("_costPrice",)

# Fields needed by the frontend product list (lightweight JSON)
PUBLIC_LIST_FIELDS = (
    "id", "sku", "name", "price", "price_range", "description", "seo_desc",
    "theme", "subcategory", "images", "tags", "badge",
)

# Product page template
PRODUCT_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <meta name="description" content="{meta_desc}">
    <link rel="canonical" href="{canonical}">
    <meta name="robots" content="index, follow">
    <meta property="og:type" content="product">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{meta_desc}">
    <meta property="og:url" content="{canonical}">
    <meta property="og:site_name" content="{site_name}">
    <meta property="og:image" content="{og_image}">
    <meta property="og:image:width" content="800">
    <meta property="og:image:height" content="800">
    <meta property="og:price:amount" content="{price}">
    <meta property="og:price:currency" content="USD">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{title}">
    <meta name="twitter:description" content="{meta_desc}">
    <meta name="twitter:image" content="{og_image}">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎉</text></svg>">
    <script type="application/ld+json">
    {{
        "@context": "https://schema.org",
        "@type": "Product",
        "name": {name_json},
        "description": {desc_json},
        "image": {images_json},
        "sku": {sku_json},
        "brand": {{
            "@type": "Brand",
            "name": "Party Maker"
        }},
        "offers": {{
            "@type": "Offer",
            "url": {canonical_json},
            "priceCurrency": "USD",
            "price": "{price}",
            "availability": "https://schema.org/InStock",
            "seller": {{
                "@type": "Organization",
                "name": "Party Maker"
            }}
        }},
        "category": {category_json}
    }}
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="{css_path}">
</head>
<body>
<header>
    <div class="header-inner">
        <a href="/" class="logo">Party <em>Maker</em></a>
        <div class="search-box">
            <svg class="search-icon" width="16" height="16"><use href="#icon-search"/></svg>
            <input type="text" placeholder="Search products or SKU..." autocomplete="off" onfocus="window.location.href='/'">
        </div>
        <nav class="header-nav">
            <a href="/" class="nav-link">Home</a>
        </nav>
        <div class="social-links">
            <a href="https://x.com/partymakercn" class="social-link" target="_blank" title="X (Twitter)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://wa.me/8617274613005" class="social-link" target="_blank" title="WhatsApp">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </a>
            <a href="https://www.tiktok.com/@partymakercn" class="social-link" target="_blank" title="TikTok">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.77 1.52V6.84a4.85 4.85 0 01-1-.15z"/></svg>
            </a>
        </div>
        <div class="header-actions">
            <a href="/" class="cart-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                <span class="cart-btn-text">Browse All</span>
            </a>
        </div>
    </div>
</header>

<main class="product-detail">
    <div class="breadcrumb">
        <a href="/">Home</a>
        <span class="sep">/</span>
        <a href="/{theme_slug}/">{theme}</a>
        <span class="sep">/</span>
        <a href="/{theme_slug}/{subcat_slug}/">{subcategory}</a>
        <span class="sep">/</span>
        <span>{name_short}</span>
    </div>

    <div class="detail-layout">
        <div class="detail-gallery">
            <div class="main-image">
                <img id="mainImg" src="{first_image}" alt="{name_escaped}" loading="eager">
            </div>
            {thumbs_html}
        </div>

        <div class="detail-info">
            <h1>{name_escaped}</h1>
            <div class="detail-sku">SKU: {sku}</div>
            <div class="detail-price">Wholesale Price: <strong>${price}</strong></div>
            {tags_html}
            <p class="detail-description">{seo_desc_escaped}</p>
            <div class="detail-category">
                Category: <a href="/{theme_slug}/{subcat_slug}/">{theme} / {subcategory}</a>
            </div>

            {specs_html}
            <div class="detail-actions">
                <a href="/?p={sku}" class="btn-inquiry">&#128722; Inquire This Product</a>
                <a href="mailto:info@partymaker.cn?subject=Inquiry: {sku} - {name_escaped}&body=Hi, I'm interested in SKU {sku}: {name_escaped}%0A%0APlease send me more details." class="btn-email">
                    &#9993; Email Inquiry
                </a>
            </div>

            <div class="detail-contact">
                <p>Need a custom quote? <a href="https://wa.me/8617274613005?text=Hi, I'm interested in SKU {sku}: {name_escaped}" target="_blank">WhatsApp us</a> or <a href="mailto:info@partymaker.cn">email us</a>.</p>
            </div>
        </div>
    </div>

    <div class="related-products">
        <h2>More {subcategory} Products</h2>
        <div class="products-grid">
            {related_html}
        </div>
    </div>
</main>

<footer>
    <div class="footer-inner">
        <div>
            <div class="footer-brand">Party <em>Maker</em></div>
            <small>Wholesale Party Supplies &mdash; Yiwu, China</small>
        </div>
        <div class="footer-links">
            <a href="/">Home</a>
            <a href="mailto:info@partymaker.cn">Contact</a>
        </div>
    </div>
    <div class="footer-copy">&copy; 2026 Party Maker. All rights reserved. | <a href="mailto:info@partymaker.cn">info@partymaker.cn</a></div>
</footer>

<style>
{detail_css}
</style>

<script>
// Thumbnail click
document.querySelectorAll('.thumb').forEach(t => {{
    t.addEventListener('click', () => {{
        document.getElementById('mainImg').src = t.dataset.full;
        document.querySelectorAll('.thumb').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
    }});
}});
// If we land here via hash fallback (old links), redirect properly
if (window.location.hash) {{
    window.location.hash = '';
}}
</script>
</body>
</html>"""

# Category page template
CATEGORY_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <meta name="description" content="{meta_desc}">
    <link rel="canonical" href="{canonical}">
    <meta name="robots" content="index, follow">
    <meta property="og:type" content="website">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{meta_desc}">
    <meta property="og:url" content="{canonical}">
    <meta property="og:site_name" content="{site_name}">
    <meta property="og:image" content="{og_image}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{title}">
    <meta name="twitter:description" content="{meta_desc}">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🎉</text></svg>">
    <script type="application/ld+json">
    {{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": {name_json},
        "description": {desc_json},
        "url": {canonical_json},
        "isPartOf": {{
            "@type": "WebSite",
            "name": "Party Maker",
            "url": "https://www.partymaker.cn"
        }},
        {item_list_json}
    }}
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="{css_path}">
</head>
<body>
<header>
    <div class="header-inner">
        <a href="/" class="logo">Party <em>Maker</em></a>
        <div class="search-box">
            <svg class="search-icon" width="16" height="16"><use href="#icon-search"/></svg>
            <input type="text" placeholder="Search products or SKU..." autocomplete="off" onfocus="window.location.href='/'">
        </div>
        <nav class="header-nav">
            <a href="/" class="nav-link">Home</a>
        </nav>
        <div class="social-links">
            <a href="https://x.com/partymakercn" class="social-link" target="_blank" title="X (Twitter)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://wa.me/8617274613005" class="social-link" target="_blank" title="WhatsApp">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </a>
            <a href="https://www.tiktok.com/@partymakercn" class="social-link" target="_blank" title="TikTok">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.77 1.52V6.84a4.85 4.85 0 01-1-.15z"/></svg>
            </a>
        </div>
        <div class="header-actions">
            <a href="/" class="cart-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                <span class="cart-btn-text">Browse All</span>
            </a>
        </div>
    </div>
</header>

<main class="category-page">
    <div class="breadcrumb">
        <a href="/">Home</a>
        <span class="sep">/</span>
        {breadcrumb_extra}
        <span>{page_name}</span>
    </div>
    <h1>{page_name}</h1>
    <p class="category-desc">{meta_desc}</p>
    <p class="products-count">{count} products</p>
    <div class="products-grid">
        {products_grid_html}
    </div>
</main>

<footer>
    <div class="footer-inner">
        <div>
            <div class="footer-brand">Party <em>Maker</em></div>
            <small>Wholesale Party Supplies &mdash; Yiwu, China</small>
        </div>
        <div class="footer-links">
            <a href="/">Home</a>
            <a href="mailto:info@partymaker.cn">Contact</a>
        </div>
    </div>
    <div class="footer-copy">&copy; 2026 Party Maker. All rights reserved. | <a href="mailto:info@partymaker.cn">info@partymaker.cn</a></div>
</footer>

<style>
{detail_css}
</style>
</body>
</html>"""


def slugify(text):
    """Convert text to URL-safe slug."""
    s = text.strip().lower()
    s = re.sub(r'[^\w\s-]', '', s)
    s = re.sub(r'[\s_]+', '-', s)
    s = re.sub(r'-+', '-', s)
    return s.strip('-')


def escape_html(text):
    """Escape HTML entities."""
    return html.escape(str(text), quote=True)


def json_str(text):
    """Return a JSON-escaped string (with quotes)."""
    return json.dumps(str(text), ensure_ascii=False)


def clean_public_product(p):
    """Return a lightweight product dict for the public frontend JSON.
    Only includes fields needed by product card rendering + lightbox."""
    slim = {}
    for key in PUBLIC_LIST_FIELDS:
        val = p.get(key)
        if val is not None:
            slim[key] = val
    return slim


def build_product_card(p, css_path="../style.css"):
    """Build a product card HTML snippet for category pages."""
    img = p['images'][0] if p.get('images') else ''
    tags = ''
    if 'hot' in (p.get('tags') or []):
        tags = '<span class="tag-hot tag-badges-item">HOT</span>'
    name = escape_html(p.get('name', ''))
    sku = escape_html(p.get('sku', ''))
    price = f"{p.get('price', 0):.2f}"
    return f"""\
    <a href="/product/{p['sku']}/" class="product-card">
        <div class="product-image">
            <img src="{img}" alt="{name}" loading="lazy">
            {tags}
        </div>
        <div class="product-info">
            <div class="product-sku">{sku}</div>
            <div class="product-name">{name}</div>
            <div class="product-price"><strong>${price}</strong></div>
        </div>
    </a>"""


def generate_product_page(product, all_products, css_path="../style.css"):
    """Generate a full product detail HTML page."""
    sku = product['sku']
    name = product.get('name', '')
    description = product.get('description', '')
    seo_desc = product.get('seo_desc', '') or description
    price = f"{product.get('price', 0):.2f}"
    theme = product.get('theme', '').strip()
    subcategory = product.get('subcategory', '').strip()
    images = product.get('images', [])
    tags = product.get('tags', []) or []

    theme_slug = slugify(theme)
    subcat_slug = slugify(subcategory)
    first_image = images[0] if images else ''

    # Title
    title = f"{name} - {sku} | {SITE_NAME}"

    # Meta description - use seo_desc (fallback to description)
    desc_for_meta = seo_desc if seo_desc else description
    desc_text = f"{desc_for_meta} SKU {sku}. Wholesale from Yiwu, China. MOQ flexible."
    meta_desc = escape_html(desc_text[:160])

    # Canonical
    canonical = f"{SITE_URL}/product/{sku}/"

    # Thumbs
    thumbs_html = ''
    if len(images) > 1:
        thumb_items = []
        for i, img in enumerate(images):
            active = ' active' if i == 0 else ''
            thumb_items.append(f'<img class="thumb{active}" src="{img}" data-full="{img}" alt="{name} - {i+1:02d}" loading="lazy">')
        thumbs_html = f'<div class="thumb-strip">{"".join(thumb_items)}</div>'

    # Tags
    tags_html = ''
    if 'hot' in tags:
        tags_html = '<span class="tag-hot">HOT</span> '
    if 'new' in tags:
        tags_html += '<span class="tag-new">NEW</span> '

    # Packaging specs table
    specs = []
    unit_size = (product.get('_unitSize') or '').strip()
    pcs_per_ctn = product.get('_pcsPerCtn', 0)
    ctn_l = product.get('_ctnL', 0)
    ctn_w = product.get('_ctnW', 0)
    ctn_h = product.get('_ctnH', 0)
    cbm = product.get('_cbm', 0)
    nw = product.get('_nw', 0)
    gw = product.get('_gw', 0)
    if unit_size:
        specs.append(('Unit Size', unit_size))
    if pcs_per_ctn and pcs_per_ctn > 0:
        specs.append(('Pcs/Carton', f"{int(pcs_per_ctn)}"))
    if ctn_l and ctn_w and ctn_h and ctn_l > 0:
        specs.append(('Carton Size', f"{ctn_l:.0f} x {ctn_w:.0f} x {ctn_h:.0f} cm"))
    if cbm and cbm > 0:
        specs.append(('CBM', f"{cbm:.3f}"))
    if nw and nw > 0:
        specs.append(('N.W.', f"{nw:.1f} kg"))
    if gw and gw > 0:
        specs.append(('G.W.', f"{gw:.1f} kg"))
    specs_html = ''
    if specs:
        rows = ''.join(f'<tr><td class="spec-label">{label}</td><td class="spec-value">{val}</td></tr>' for label, val in specs)
        specs_html = f'<div class="detail-specs"><h3>Packaging Details</h3><table class="specs-table">{rows}</table></div>'

    # Related products (same subcategory, exclude self, max 8)
    related = [p for p in all_products
               if p.get('subcategory', '').strip() == subcategory
               and p['sku'] != sku][:8]
    related_html = '\n'.join(build_product_card(r, css_path) for r in related)

    # Short name for breadcrumb (truncate if too long)
    name_short = name if len(name) <= 50 else name[:47] + '...'

    # JSON-LD values
    name_json = json_str(name)
    desc_json = json_str(desc_text)
    images_json = json.dumps(images[:5], ensure_ascii=False)
    sku_json = json_str(sku)
    canonical_json = json_str(canonical)
    category_json = json_str(f"{theme} > {subcategory}")

    page_html = PRODUCT_TEMPLATE.format(
        title=escape_html(title),
        meta_desc=meta_desc,
        canonical=canonical,
        site_name=SITE_NAME,
        og_image=first_image,
        price=price,
        name_escaped=escape_html(name),
        seo_desc_escaped=escape_html(seo_desc),
        sku=sku,
        theme=escape_html(theme),
        theme_slug=theme_slug,
        subcategory=escape_html(subcategory),
        subcat_slug=subcat_slug,
        name_short=escape_html(name_short),
        first_image=first_image,
        thumbs_html=thumbs_html,
        tags_html=tags_html,
        specs_html=specs_html,
        related_html=related_html,
        css_path=css_path,
        detail_css=DETAIL_CSS,
        name_json=name_json,
        desc_json=desc_json,
        images_json=images_json,
        sku_json=sku_json,
        canonical_json=canonical_json,
        category_json=category_json,
    )
    return page_html


def generate_category_page(theme, subcategory, products, all_products, css_path="../style.css"):
    """Generate a category listing HTML page."""
    if subcategory:
        page_name = f"{theme} - {subcategory}"
        slug = f"/{slugify(theme)}/{slugify(subcategory)}/"
        breadcrumb_extra = f'<a href="/{slugify(theme)}/">{escape_html(theme)}</a><span class="sep">/</span>'
    else:
        page_name = theme
        slug = f"/{slugify(theme)}/"
        breadcrumb_extra = ''

    canonical = f"{SITE_URL}{slug}"
    title = f"{page_name} Wholesale Products | {SITE_NAME}"
    desc_text = f"Browse {len(products)} wholesale {page_name} products. Factory-direct pricing from Yiwu, China. Flexible MOQ, global shipping."
    meta_desc = escape_html(desc_text[:160])

    # Build product cards
    products_html = '\n'.join(build_product_card(p, css_path) for p in products)

    # JSON-LD: ItemList
    items = []
    for i, p in enumerate(products[:20], 1):  # Google recommends max ~20 items
        items.append(f'{{"@type":"ListItem","position":{i},"item":{{"@type":"Product","name":{json_str(p.get("name",""))},"url":"{SITE_URL}/product/{p["sku"]}/"}}}}')
    item_list_json = '"itemListElement": [' + ','.join(items) + ']'

    page_html = CATEGORY_TEMPLATE.format(
        title=escape_html(title),
        meta_desc=meta_desc,
        canonical=canonical,
        site_name=SITE_NAME,
        og_image=products[0]['images'][0] if products and products[0].get('images') else '',
        page_name=escape_html(page_name),
        breadcrumb_extra=breadcrumb_extra,
        count=len(products),
        products_grid_html=products_html,
        css_path=css_path,
        detail_css=DETAIL_CSS,
        name_json=json_str(page_name),
        desc_json=json_str(desc_text),
        canonical_json=json_str(canonical),
        item_list_json=item_list_json,
    )
    return page_html


def generate_sitemap(urls, output_path):
    """Generate sitemap.xml."""
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    xml_lines = ['<?xml version="1.0" encoding="UTF-8"?>',
                 '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, priority, changefreq in urls:
        xml_lines.append(f'  <url><loc>{loc}</loc><lastmod>{today}</lastmod>'
                        f'<changefreq>{changefreq}</changefreq><priority>{priority}</priority></url>')
    xml_lines.append('</urlset>')
    output_path.write_text('\n'.join(xml_lines), encoding='utf-8')


def generate_robots(sitemap_url, output_path):
    """Generate robots.txt."""
    text = f"""User-agent: *
Allow: /

Sitemap: {sitemap_url}

# Block AI crawlers from API endpoints
User-agent: GPTBot
Disallow: /api/

User-agent: ChatGPT-User
Disallow: /api/

User-agent: ClaudeBot
Disallow: /api/

User-agent: Bytespider
Disallow: /api/

User-agent: Applebot-Extended
Disallow: /api/
"""
    output_path.write_text(text, encoding='utf-8')


# Detail page specific CSS (inlined in generated pages)
DETAIL_CSS = """
/* Product Detail Page */
.product-detail {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #4A5A3A;
}
.product-detail .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.8rem;
    color: #7A8A6A;
    margin-bottom: 1.5rem;
}
.product-detail .breadcrumb a {
    color: #7A8A6A;
    text-decoration: none;
    transition: color 0.15s;
}
.product-detail .breadcrumb a:hover { color: #9CAF88; }
.product-detail .breadcrumb .sep { font-size: 0.7rem; }

.detail-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2.5rem;
    margin-bottom: 3rem;
}
.detail-gallery .main-image {
    border-radius: 10px;
    overflow: hidden;
    background: #F7F9F5;
    border: 1.5px solid #D9E0D1;
}
.detail-gallery .main-image img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    display: block;
}
.thumb-strip {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
    overflow-x: auto;
}
.thumb-strip img {
    width: 72px;
    height: 72px;
    object-fit: cover;
    border-radius: 6px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: border-color 0.2s;
    flex-shrink: 0;
}
.thumb-strip img:hover { border-color: #9CAF88; }
.thumb-strip img.active { border-color: #D4AF37; }

.detail-info h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: #4A5A3A;
    margin-bottom: 0.5rem;
    letter-spacing: -0.01em;
}
.detail-sku {
    font-size: 0.82rem;
    color: #7A8A6A;
    font-family: 'Courier New', monospace;
    margin-bottom: 0.5rem;
}
.detail-price {
    font-size: 1rem;
    color: #5A6A4A;
    margin-bottom: 1rem;
}
.detail-price strong {
    color: #B8960F;
    font-size: 1.3rem;
}
.tag-hot, .tag-new {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-right: 0.3rem;
}
.tag-hot { background: linear-gradient(135deg, #ff6b6b, #ee5a5a); color: white; }
.tag-new { background: linear-gradient(135deg, #4CAF50, #45a049); color: white; }
.detail-description {
    font-size: 0.95rem;
    line-height: 1.7;
    color: #5A6A4A;
    margin-bottom: 1.25rem;
}
.detail-category {
    font-size: 0.85rem;
    color: #7A8A6A;
    margin-bottom: 1.5rem;
}
.detail-category a { color: #9CAF88; font-weight: 600; text-decoration: none; }
.detail-category a:hover { text-decoration: underline; }
.detail-specs {
    background: #F7F9F5;
    border-radius: 8px;
    padding: 1rem 1.25rem;
    margin-bottom: 1.25rem;
}
.detail-specs h3 {
    font-size: 0.85rem;
    font-weight: 600;
    color: #4A5A3A;
    margin-bottom: 0.6rem;
}
.specs-table {
    width: 100%;
    border-collapse: collapse;
}
.specs-table tr { border-bottom: 1px solid #E8EEE3; }
.specs-table tr:last-child { border-bottom: none; }
.specs-table td { padding: 0.4rem 0; font-size: 0.82rem; }
.specs-table .spec-label { color: #7A8A6A; font-weight: 500; width: 45%; }
.specs-table .spec-value { color: #4A5A3A; font-weight: 600; font-family: 'Courier New', monospace; }

.detail-actions {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
}
.btn-inquiry {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.65rem 1.25rem;
    background: #9CAF88;
    color: white;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    text-decoration: none;
    transition: background 0.2s, transform 0.15s;
}
.btn-inquiry:hover { background: #7A8B6E; transform: translateY(-1px); }
.btn-email {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.65rem 1.25rem;
    border: 1.5px solid #D9E0D1;
    color: #5A6A4A;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    text-decoration: none;
    transition: all 0.2s;
}
.btn-email:hover { border-color: #9CAF88; color: #9CAF88; }
.detail-contact {
    padding: 1rem;
    background: #F7F9F5;
    border-radius: 8px;
    font-size: 0.85rem;
    color: #7A8A6A;
}
.detail-contact a { color: #9CAF88; font-weight: 600; }

.related-products {
    margin-top: 2rem;
}
.related-products h2 {
    font-size: 1.2rem;
    font-weight: 700;
    margin-bottom: 1rem;
}

/* Category page */
.category-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
    font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #4A5A3A;
}
.category-page .breadcrumb {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.8rem;
    color: #7A8A6A;
    margin-bottom: 0.75rem;
}
.category-page .breadcrumb a {
    color: #7A8A6A;
    text-decoration: none;
    transition: color 0.15s;
}
.category-page .breadcrumb a:hover { color: #9CAF88; }
.category-page .breadcrumb .sep { font-size: 0.7rem; }
.category-page h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
}
.category-desc {
    font-size: 0.9rem;
    color: #7A8A6A;
    margin-bottom: 0.5rem;
}
.category-page .products-count {
    color: #7A8A6A;
    font-size: 0.85rem;
    margin-bottom: 1.25rem;
}

/* Product grid (same as main site) */
.products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 1.25rem;
}
.product-card {
    background: #fff;
    border: 1.5px solid #D9E0D1;
    border-radius: 10px;
    overflow: hidden;
    transition: transform 0.2s, box-shadow 0.2s;
    display: flex;
    flex-direction: column;
    text-decoration: none;
    color: inherit;
}
.product-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 30px rgba(122,139,110,0.12);
    border-color: #D4AF37;
}
.product-image {
    width: 100%;
    aspect-ratio: 1 / 1;
    background: #F7F9F5;
    position: relative;
    overflow: hidden;
}
.product-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s;
}
.product-card:hover .product-image img { transform: scale(1.04); }
.tag-badges-item {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}
.product-info {
    padding: 0.85rem;
    flex: 1;
    display: flex;
    flex-direction: column;
}
.product-sku {
    font-size: 0.68rem;
    color: #7A8A6A;
    font-family: 'Courier New', monospace;
    margin-bottom: 0.2rem;
}
.product-name {
    font-size: 0.85rem;
    font-weight: 600;
    color: #4A5A3A;
    margin-bottom: 0.3rem;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.product-price {
    font-size: 0.8rem;
    color: #5A6A4A;
}
.product-price strong {
    color: #B8960F;
    font-size: 0.92rem;
    font-weight: 700;
}

/* Footer */
footer {
    background: #4A5A3A;
    color: rgba(255,255,255,0.8);
    padding: 2rem;
    margin-top: 3rem;
}
.footer-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
}
.footer-brand { font-size: 1.2rem; font-weight: 700; color: #fff; }
.footer-brand em { font-style: normal; color: #D4AF37; }
.footer-links a { color: rgba(255,255,255,0.7); text-decoration: none; margin-left: 1rem; }
.footer-links a:hover { color: #fff; }
.footer-copy {
    max-width: 1200px;
    margin: 1rem auto 0;
    padding-top: 1rem;
    border-top: 1px solid rgba(255,255,255,0.1);
    font-size: 0.8rem;
    color: rgba(255,255,255,0.5);
    text-align: center;
}
.footer-copy a { color: rgba(255,255,255,0.7); }

/* Header shared */
header {
    background: #9CAF88;
    border-bottom: 1px solid rgba(255,255,255,0.2);
    position: sticky;
    top: 0;
    z-index: 100;
}
.header-inner {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0.8rem 2rem;
    display: flex;
    align-items: center;
    gap: 1.5rem;
}
.logo {
    font-size: 1.4rem;
    font-weight: 700;
    color: #FFFFFF;
    text-decoration: none;
    flex-shrink: 0;
    letter-spacing: -0.02em;
}
.logo em { font-style: normal; color: #D4AF37; }
.search-box {
    flex: 1;
    max-width: 480px;
    position: relative;
}
.search-box input {
    width: 100%;
    padding: 0.55rem 1rem 0.55rem 2.5rem;
    border: 1.5px solid rgba(255,255,255,0.4);
    border-radius: 50px;
    font-size: 0.88rem;
    outline: none;
    background: rgba(255,255,255,0.95);
    color: #4A5A3A;
    -webkit-text-fill-color: #4A5A3A;
}
.search-icon {
    position: absolute;
    left: 0.9rem;
    top: 50%;
    transform: translateY(-50%);
    color: #7A8A6A;
    pointer-events: none;
}
.nav-link {
    padding: 0.4rem 0.9rem;
    border-radius: 50px;
    text-decoration: none;
    color: rgba(255,255,255,0.9);
    font-size: 0.88rem;
    font-weight: 500;
}
.nav-link:hover { background: rgba(255,255,255,0.15); color: #fff; }
.social-links {
    display: flex;
    gap: 0.35rem;
    align-items: center;
}
.social-link {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    color: rgba(255,255,255,0.9);
    background: rgba(255,255,255,0.15);
    transition: all 0.2s;
    border: 1px solid rgba(255,255,255,0.25);
}
.social-link:hover {
    background: rgba(255,255,255,0.25);
    color: #fff;
    transform: translateY(-2px);
}
.cart-btn {
    background: #D4AF37;
    color: white;
    border: none;
    padding: 0.5rem 1.1rem;
    border-radius: 50px;
    font-size: 0.88rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    transition: background 0.2s, transform 0.15s;
    white-space: nowrap;
}
.cart-btn:hover { background: #B8960F; transform: translateY(-1px); }

/* Responsive */
@media (max-width: 768px) {
    .detail-layout { grid-template-columns: 1fr; gap: 1.5rem; }
    .header-inner { padding: 0.6rem 1rem; }
    .search-box { max-width: 200px; }
    .social-links { display: none; }
    .products-grid { grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
    .product-detail, .category-page { padding: 1rem; }
    .footer-inner { flex-direction: column; text-align: center; }
}
"""


def main():
    import sys
    demo_mode = '--demo' in sys.argv

    print(f"Loading {PRODUCTS_JSON}...")
    with open(PRODUCTS_JSON, 'r', encoding='utf-8') as f:
        data = json.load(f)
    products = data.get('products', data) if isinstance(data, dict) else data
    print(f"  Found {len(products)} products")

    # === 1. Generate products-public.json (strip internal fields) ===
    public_products = [clean_public_product(p) for p in products]
    public_data = {"products": public_products}
    PUBLIC_JSON.write_text(json.dumps(public_data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    pub_size = PUBLIC_JSON.stat().st_size
    print(f"\n[1] products-public.json: {len(public_products)} products, {pub_size/1024:.0f} KB")

    # === 2. Build category index ===
    # structure: {theme: {subcategory: [products]}}
    cat_index = {}
    for p in products:
        theme = (p.get('theme') or 'Other').strip()
        subcat = (p.get('subcategory') or 'General').strip()
        if theme not in cat_index:
            cat_index[theme] = {}
        if subcat not in cat_index[theme]:
            cat_index[theme][subcat] = []
        cat_index[theme][subcat].append(p)

    # === 3. Generate product pages ===
    if demo_mode:
        # Only first 3 products
        products_to_gen = products[:3]
    else:
        products_to_gen = products

    product_dir = WEBSITE_DIR / "product"
    count = 0
    for p in products_to_gen:
        sku = p['sku']
        out_dir = product_dir / sku
        out_dir.mkdir(parents=True, exist_ok=True)
        page_html = generate_product_page(p, products)
        (out_dir / "index.html").write_text(page_html, encoding='utf-8')
        count += 1

    print(f"\n[2] Product pages: {count} generated in {product_dir}/")

    # === 4. Generate category pages ===
    cat_count = 0
    sitemap_urls = []

    # Homepage
    sitemap_urls.append((f"{SITE_URL}/", "1.0", "daily"))

    for theme, subcats in sorted(cat_index.items()):
        theme_slug = slugify(theme)
        # Theme page
        theme_products = []
        for sub_products in subcats.values():
            theme_products.extend(sub_products)
        theme_dir = WEBSITE_DIR / theme_slug
        theme_dir.mkdir(parents=True, exist_ok=True)
        theme_html = generate_category_page(theme, None, theme_products, products)
        (theme_dir / "index.html").write_text(theme_html, encoding='utf-8')
        sitemap_urls.append((f"{SITE_URL}/{theme_slug}/", "0.8", "weekly"))
        cat_count += 1

        # Subcategory pages
        for subcat, sub_products in sorted(subcats.items()):
            subcat_slug = slugify(subcat)
            subcat_dir = WEBSITE_DIR / theme_slug / subcat_slug
            subcat_dir.mkdir(parents=True, exist_ok=True)
            subcat_html = generate_category_page(theme, subcat, sub_products, products)
            (subcat_dir / "index.html").write_text(subcat_html, encoding='utf-8')
            sitemap_urls.append((f"{SITE_URL}/{theme_slug}/{subcat_slug}/", "0.7", "weekly"))
            cat_count += 1

    print(f"[3] Category pages: {cat_count} generated")

    # === 5. Add product URLs to sitemap ===
    for p in products:
        sitemap_urls.append((f"{SITE_URL}/product/{p['sku']}/", "0.6", "monthly"))

    print(f"[4] Sitemap URLs: {len(sitemap_urls)} total")

    # === 6. Generate sitemap.xml ===
    generate_sitemap(sitemap_urls, SITEMAP_FILE)
    print(f"[5] sitemap.xml: updated ({len(sitemap_urls)} URLs)")

    # === 7. Generate robots.txt ===
    generate_robots(f"{SITE_URL}/sitemap.xml", ROBOTS_FILE)
    print(f"[6] robots.txt: updated")

    print(f"\nDone! Generated {count} product pages + {cat_count} category pages.")
    if demo_mode:
        print("  (DEMO MODE: only 3 product pages generated)")


if __name__ == '__main__':
    main()
