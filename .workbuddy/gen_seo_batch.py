import json, random, math

with open('.workbuddy/seo_pending.json', 'r', encoding='utf-8') as f:
    pending = json.load(f)

MATERIAL_WORDS = {
    'paper': ['paper-based', 'card stock', 'heavyweight paper', 'quality paper'],
    'plastic': ['plastic', 'durable plastic', 'lightweight plastic', 'polymer'],
    'metal': ['metal', 'powder-coated metal', 'metal alloy', 'wrought metal'],
    'glass': ['glass', 'clear glass', 'colored glass', 'textured glass'],
    'wood': ['wood', 'natural wood', 'MDF wood', 'plywood'],
    'fabric': ['fabric', 'textile', 'woven fabric', 'polyester fabric'],
    'foil': ['foil', 'metallic foil', 'mylar foil', 'shiny foil'],
    'latex': ['latex', 'natural latex', 'helium-grade latex'],
    'chrome': ['chrome', 'metallic chrome', 'chrome-look'],
    'gold': ['gold-toned', 'gold-finished', 'gold-colored'],
    'silver': ['silver-toned', 'silver-finished'],
    'sticker': ['adhesive vinyl', 'self-adhesive', 'vinyl decal'],
    'felt': ['felt', 'wool-blend felt'],
    'cardboard': ['cardboard', 'corrugated board', 'fiberboard'],
    'ribbon': ['satin ribbon', 'grosgrain ribbon', 'polyester ribbon'],
    'rope': ['jute rope', 'cotton rope', 'twine'],
    'bead': ['acrylic bead', 'wood bead', 'glass bead'],
    'glitter': ['glitter-coated', 'glitter-finish'],
    'led': ['LED-lit', 'battery-powered LED', 'LED-embedded'],
    'acrylic': ['acrylic', 'clear acrylic', 'frosted acrylic'],
    'resin': ['resin', 'cast resin', 'polyresin'],
    'ceramic': ['ceramic', 'glazed ceramic'],
    'candle': ['wax', 'LED flame-effect wax', 'battery candle'],
    'net': ['mesh netting', 'tulle netting'],
    'cloth': ['polyester cloth', 'non-woven fabric'],
    'rattan': ['rattan', 'woven rattan'],
    'bamboo': ['bamboo', 'natural bamboo'],
}

def detect_material(desc, name):
    text = (desc + ' ' + name).lower()
    found = []
    for key, variants in MATERIAL_WORDS.items():
        if key in text:
            found.append(random.choice(variants))
    return found

def build_material_phrase(p):
    desc = p['description']
    name = p['name']
    materials = detect_material(desc, name)
    if materials:
        mat_list = ', '.join(materials[:2])
        return mat_list
    return None

def make_opener(p):
    name = p['name']
    theme = p['theme']
    subcat = p['subcategory']
    price = p['price']
    desc = p['description']
    mat_phrase = build_material_phrase(p)

    patterns = []
    patterns.append(f"{name} is a {theme.lower()} {subcat.lower()} product shipped factory-direct from Yiwu, China.")

    if desc:
        clean_desc = desc.split('\n')[0].strip().rstrip('.')
        if len(clean_desc) > 5 and len(clean_desc) < 80:
            patterns.append(f"A {theme.lower()} {subcat.lower()} item from our Yiwu factory, {name} features {clean_desc}.")

    if mat_phrase:
        patterns.append(f"Crafted from {mat_phrase} and sourced direct from our Yiwu production line, {name} is a {theme.lower()} {subcat.lower()} product.")
        patterns.append(f"Part of our {theme.lower()} collection, {name} uses {mat_phrase} - manufactured and shipped directly from Yiwu.")

    if price and float(price) > 5:
        patterns.append(f"{name} - a {theme.lower()} {subcat.lower()} at ${float(price):.2f}/pc wholesale from Yiwu, China.")

    patterns.append(f"Sourced directly from our Yiwu factory, {name} belongs to the {theme.lower()} {subcat.lower()} range.")

    pcs = p.get('_pcsPerCtn', 0) or 0
    if pcs > 0:
        patterns.append(f"{name} ships {int(pcs)} pcs per carton from our Yiwu warehouse - a {theme.lower()} {subcat.lower()} product for bulk buyers.")

    return random.choice(patterns)

def make_details(p):
    desc = p['description']
    mat_phrase = build_material_phrase(p)
    parts = []

    if desc:
        lines = [l.strip() for l in desc.split('\n') if l.strip()]
        meaningful = [l for l in lines if len(l) > 3]
        if meaningful:
            parts.append('. '.join(meaningful[:2]))

    if mat_phrase and not desc.lower().startswith(mat_phrase.split(',')[0]):
        parts.insert(0, f"Made of {mat_phrase}")

    return '. '.join(parts) if parts else ""

def make_price(p):
    price = p['price']
    if not price or float(price) <= 0:
        return ""
    price = float(price)
    retail_lo = round(price * 2.8, 2)
    retail_hi = round(price * 3.5, 2)
    margin = round((retail_lo - price) / retail_lo * 100) if retail_lo > 0 else 0

    patterns = []
    if price < 1:
        patterns.append(f"Wholesale price ${price:.2f}/pc, with suggested retail at ${retail_lo:.2f}-${retail_hi:.2f} (margin ~{margin}%).")
        patterns.append(f"Priced at just ${price:.2f}/pc wholesale; retailers can mark up to ${retail_lo:.2f}-${retail_hi:.2f}, a ~{margin}% margin.")
    elif price < 5:
        patterns.append(f"Wholesale ${price:.2f}/pc, retail recommendation ${retail_lo:.2f}-${retail_hi:.2f}, delivering roughly {margin}% retail margin.")
        patterns.append(f"At ${price:.2f}/pc wholesale, the retail spread is ${retail_lo:.2f}-${retail_hi:.2f}, with a margin around {margin}%.")
    else:
        patterns.append(f"Wholesale at ${price:.2f}/pc; suggested retail ${retail_lo:.2f}-${retail_hi:.2f}, expected retail margin ~{margin}%.")
        patterns.append(f"Factory price ${price:.2f}/pc, retail targets ${retail_lo:.2f}-${retail_hi:.2f} - about {margin}% retail margin.")
    return random.choice(patterns)

def make_packing(p):
    pcs = p.get('_pcsPerCtn', 0) or 0
    cbm = p.get('_cbm', 0) or 0
    price = p['price']
    if not pcs or not cbm or float(pcs) <= 0 or float(cbm) <= 0:
        return ""
    pcs = float(pcs)
    cbm = float(cbm)

    patterns = []
    if price and float(price) > 0:
        cv = pcs * float(price)
        density = int(pcs / cbm)
        patterns.append(f"Carton: {int(pcs)} pcs, CBM {cbm:.2f}, carton value ${cv:,.2f}, approximately {density} units per cubic meter.")
        patterns.append(f"Each carton holds {int(pcs)} pcs at {cbm:.2f} CBM (${cv:,.2f} carton value, ~{density} pcs per cubic meter).")
        patterns.append(f"Packed {int(pcs)} pcs per carton ({cbm:.2f} CBM), total carton value ${cv:,.2f} - about {density} units per cubic meter.")
    else:
        density = int(pcs / cbm)
        patterns.append(f"Carton: {int(pcs)} pcs, {cbm:.2f} CBM, about {density} units per cubic meter.")
        patterns.append(f"Ships {int(pcs)} pcs per carton at {cbm:.2f} CBM (~{density} pcs per cubic meter).")

    return random.choice(patterns)

def make_hot(p):
    tags = p.get('tags', [])
    if isinstance(tags, list):
        is_hot = any('hot' in str(t).lower() for t in tags)
    else:
        is_hot = 'hot' in str(tags).lower()

    if is_hot:
        patterns = [
            "Tagged as a hot seller based on 2026 buyer activity.",
            "Marked as a trending item in 2026 buyer analytics.",
            "2026 buyer data identifies this as a high-demand hot seller.",
        ]
        return random.choice(patterns)
    return ""

CTA = "No MOQ for spot goods. Custom from 600 pcs with private labeling. Global shipping. Contact info@partymaker.cn."

random.seed(42)
seo_queue = {}

for p in pending:
    parts = []

    opener = make_opener(p)
    parts.append(opener)

    details = make_details(p)
    if details:
        parts.append(details + ".")

    price_part = make_price(p)
    if price_part:
        parts.append(price_part)

    packing = make_packing(p)
    if packing:
        parts.append(packing)

    hot = make_hot(p)
    if hot:
        parts.append(hot)

    parts.append(CTA)

    seo_queue[p['sku']] = ' '.join(parts)

with open('.workbuddy/seo_queue.json', 'w', encoding='utf-8') as f:
    json.dump(seo_queue, f, ensure_ascii=False, indent=2)

# Show samples
items = list(seo_queue.items())
for i in [0, 10, 20, 40, 80, 150, 200, 250, 280]:
    if i < len(items):
        sku, text = items[i]
        print(f"\n=== Sample #{i+1} SKU={sku} ===")
        print(text[:350])
        print("...")

print(f"\n\nTotal generated: {len(seo_queue)} seo_desc saved to .workbuddy/seo_queue.json")
