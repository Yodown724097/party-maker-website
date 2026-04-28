// ============ CONFIG ============
const R2_PRODUCTS_URL = '/products.json';
// Direct to Cloudflare Pages Function (no CORS issues, no VPS needed)
const WORKER_URL = '/api/generate';
const QTY_STEP = 12;
const PAGE_SIZE = 24;

// ============ STATE ============
    let allProducts = [];  // loaded via fetch
let filteredProducts = [];
let cart = [];
let currentTheme = 'all';
let currentSubcat = 'all';
let searchQuery = '';
let visibleCount = PAGE_SIZE;

// ============ INIT ============
async function init() {
    setupSearch();
    await loadProducts();
    // Apply route from URL path (not hash)
    applyRoute();
}

// ============ INIT ============
    // ============ LOAD PRODUCTS (embedded) ============
async function loadProducts() {
    // Fetch product data from products.json
    try {
        const resp = await fetch('/products-public.json');
        if (!resp.ok) throw new Error('Failed to load products: ' + resp.status);
        const data = await resp.json();
        allProducts = data.products || data || [];
        console.log('Loaded ' + allProducts.length + ' products');
    } catch (err) {
        console.error('Error loading products:', err);
        const productsGridEl = document.getElementById('productsGrid');
        if (productsGridEl) {
            productsGridEl.innerHTML =
                '<div style="text-align:center;padding:4rem 1rem;color:var(--text-light);grid-column:1/-1;">' +
                '<p>Failed to load products. Please refresh the page.</p></div>';
        }
        return;
    }
    buildCategoryList();
    // Ramadan: active pill + expanded sidebar
    currentTheme = 'Ramadan';
    currentSubcat = 'all';
    // Activate Ramadan pill
    document.querySelectorAll('.theme-pill').forEach(p => {
        p.classList.toggle('active', p.textContent.includes('Ramadan'));
    });
    // Expand Ramadan subcat list + arrow
    const ramadanList = document.getElementById('sl-Ramadan');
    const ramadanLabel = document.getElementById('tl-Ramadan');
    if (ramadanList) ramadanList.classList.add('open');
    if (ramadanLabel) ramadanLabel.classList.add('open');
    filterAndRender();
}

function buildCategoryList() {
    const structure = {};
    allProducts.forEach(p => {
        const theme = (p.theme || 'Other').trim();
        const subcat = (p.subcategory || 'General').trim();
        if (!structure[theme]) structure[theme] = {};
        structure[theme][subcat] = (structure[theme][subcat] || 0) + 1;
    });

    const total = allProducts.length;
    // Ramadan first, then alphabetical
    const themes = Object.keys(structure).sort((a,b) => {
        if (a === 'Ramadan') return -1;
        if (b === 'Ramadan') return 1;
        return a.localeCompare(b);
    });

    // Theme quick pills
    const pillsContainer = document.getElementById('themePills');
    if (pillsContainer) {
        pillsContainer.innerHTML = themes.map(t => {
            const isRamadan = t === 'Ramadan';
            const count = Object.values(structure[t]).reduce((a,b)=>a+b,0);
            return `<button class="theme-pill ${isRamadan ? 'ramadan' : ''}${t === 'Ramadan' ? ' active' : ''}" onclick="setCategory('${t.replace(/'/g,"\\'")}','all');scrollToTop()">${t} (${count})</button>`;
        }).join('');
    }

    // Desktop
    const list = document.getElementById('categoryList');
    list.innerHTML = `
        <div class="theme-group">
            <div class="theme-label" onclick="setCategory('all','all')">
                All Products
                <span class="count">${total}</span>
            </div>
        </div>`;
    themes.forEach(theme => {
        const subcats = Object.keys(structure[theme]).sort();
        const themeTotal = Object.values(structure[theme]).reduce((a,b)=>a+b,0);
        list.innerHTML += `
            <div class="theme-group">
                <div class="theme-label" id="tl-${theme.replace(/[^a-zA-Z0-9]/g,'_')}" onclick="toggleTheme('${theme.replace(/'/g,"\\'")}')">
                    ${theme}
                    <span class="count">${themeTotal}</span>
                    <span class="arrow">&#9662;</span>
                </div>
                <ul class="subcat-list" id="sl-${theme.replace(/[^a-zA-Z0-9]/g,'_')}">
                    ${subcats.map(sub => `
                        <li><a href="#" data-theme="${theme}" data-subcat="${sub}">
                            ${sub}
                            <span class="count">${structure[theme][sub]}</span>
                        </a></li>`).join('')}
                </ul>
            </div>`;
    });

    list.querySelectorAll('.subcat-list a').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            document.querySelectorAll('.subcat-list a').forEach(x=>x.classList.remove('active'));
            a.classList.add('active');
            currentTheme = a.dataset.theme;
            currentSubcat = a.dataset.subcat;
            updateSectionTitle();
            filterAndRender();
            toggleMobileMenu(false);
        });
    });

    // Mobile
    const mobileList = document.getElementById('mobileCategoryList');
    mobileList.innerHTML = `
        <div class="theme-group" style="margin-bottom:0.75rem;">
            <div class="theme-label" style="cursor:pointer;" onclick="setCategory('all','all')">
                All Products <span class="count">${total}</span>
            </div>
        </div>`;
    themes.forEach(theme => {
        const subcats = Object.keys(structure[theme]).sort();
        const themeTotal = Object.values(structure[theme]).reduce((a,b)=>a+b,0);
        mobileList.innerHTML += `
            <div style="margin-bottom:0.5rem;">
                <div style="font-size:0.72rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-light);font-weight:600;padding:0.25rem 0.5rem;margin-bottom:0.1rem;">
                    ${theme} (${themeTotal})
                </div>
                ${subcats.map(sub => `
                    <div style="padding:0.4rem 0.5rem;font-size:0.83rem;color:var(--text-mid);cursor:pointer;display:flex;justify-content:space-between;align-items:center;border-radius:var(--radius-sm);"
                        onclick="setCategory('${theme.replace(/'/g,"\\'")}','${sub.replace(/'/g,"\\'")}');toggleMobileMenu(false)">
                        <span>${sub}</span>
                        <span style="font-size:0.72rem;color:var(--text-light);">${structure[theme][sub]}</span>
                    </div>`).join('')}
            </div>`;
    });
}

function toggleTheme(theme) {
    const id = 'sl-' + theme.replace(/[^a-zA-Z0-9]/g,'_');
    const el = document.getElementById(id);
    const labelEl = document.getElementById('tl-' + theme.replace(/[^a-zA-Z0-9]/g,'_'));
    if (!el) return;
    const isOpen = el.classList.contains('open');
    el.classList.toggle('open');
    if (labelEl) labelEl.classList.toggle('open', !isOpen);
}

function setCategory(theme, subcat) {
    currentTheme = theme;
    currentSubcat = subcat !== undefined ? subcat : 'all';
    document.querySelectorAll('.subcat-list a').forEach(a => {
        a.classList.toggle('active', a.dataset.theme === theme && a.dataset.subcat === currentSubcat);
    });
    // Update pill active state
    document.querySelectorAll('.theme-pill').forEach(p => {
        p.classList.toggle('active', p.textContent.includes(theme));
    });
    updateSectionTitle();
    filterAndRender();
    updateUrlFromState();
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateSectionTitle() {
    const el = document.getElementById('sectionTitle');
    const bc = document.querySelector('.breadcrumb');
    if (!el || !bc) return; // 如果元素不存在，直接返回
    if (currentTheme === 'all') {
        el.textContent = 'All Products';
        bc.innerHTML = '<span>All Products</span>';
    } else if (currentSubcat === 'all') {
        el.textContent = currentTheme;
        bc.innerHTML = `<span onclick="setCategory('all','all')">All Products</span> <span class="sep">&rsaquo;</span> <span>${currentTheme}</span>`;
    } else {
        el.textContent = currentSubcat;
        bc.innerHTML = `<span onclick="setCategory('all','all')">All Products</span> <span class="sep">&rsaquo;</span> <span onclick="setCategory('${currentTheme}','all')">${currentTheme}</span> <span class="sep">&rsaquo;</span> <span>${currentSubcat}</span>`;
    }
}

// ============ MOBILE MENU ============
function toggleMobileMenu(force) {
    const overlay = document.getElementById('mobileOverlay');
    const sidebar = document.getElementById('mobileSidebar');
    const isOpen = sidebar.classList.contains('open');
    const shouldOpen = force !== undefined ? force : !isOpen;
    if (shouldOpen) {
        overlay.classList.add('active');
        sidebar.classList.add('open');
    } else {
        overlay.classList.remove('active');
        sidebar.classList.remove('open');
    }
}

// ============ SEARCH ============
function setupSearch() {
    const input = document.getElementById('searchInput');
    let timer;
    input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            searchQuery = input.value.trim().toLowerCase();
            filterAndRender();
        }, 250);
    });
}

// ============ FILTER ============
function filterAndRender() {
    filteredProducts = allProducts.filter(p => {
        const matchTheme = currentTheme === 'all' || (p.theme || '') === currentTheme;
        const matchSubcat = currentSubcat === 'all' || (p.subcategory || '') === currentSubcat;
        const q = searchQuery;
        const matchSearch = !q ||
            (p.name || '').toLowerCase().includes(q) ||
            (p.sku || '').toLowerCase().includes(q) ||
            (p.theme || '').toLowerCase().includes(q) ||
            (p.subcategory || '').toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q);
        return matchTheme && matchSubcat && matchSearch;
    });

    // 过滤掉无图产品
    filteredProducts = filteredProducts.filter(p => p.images && p.images.length > 0);

    // 排序：hot > new > 普通产品（按名称）
    filteredProducts.sort((a, b) => {
        const tagsA = a.tags || [];
        const tagsB = b.tags || [];
        const aHot = tagsA.includes('hot') ? 0 : 1;
        const bHot = tagsB.includes('hot') ? 0 : 1;
        if (aHot !== bHot) return aHot - bHot;  // hot优先
        const aNew = tagsA.includes('new') ? 0 : 1;
        const bNew = tagsB.includes('new') ? 0 : 1;
        if (aNew !== bNew) return aNew - bNew;  // new次之
        return (a.name || '').localeCompare(b.name || '');  // 按名称排序
    });

    const productsCountEl = document.getElementById('productsCount');
    if (productsCountEl) productsCountEl.textContent = `${filteredProducts.length} products`;
    visibleCount = PAGE_SIZE; // 重置分页显示数量
    renderProducts();
}

// ============ RENDER PRODUCTS ============
function renderProducts() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return; // 如果productsGrid元素不存在，直接返回
    if (filteredProducts.length === 0) {
        grid.innerHTML = `
            <div style="text-align:center;padding:4rem 1rem;color:var(--text-light);grid-column:1/-1;">
                <svg width="48" height="48" style="margin-bottom:1rem"><use href="#icon-search"/></svg>
                <p>No products found.</p>
            </div>`;
        return;
    }
    
    // 只渲染当前可见的产品数量
    const productsToShow = filteredProducts.slice(0, visibleCount);
    
    let html = productsToShow.map(p => {
        const inCart = cart.some(c => c.id === p.id);
        const imgUrl = p.images && p.images[0] ? p.images[0] : '';
        const imagesJson = encodeURIComponent(JSON.stringify(p.images || []));
        const imgCount = p.images ? p.images.length : 0;
        const imgDots = imgCount > 1 ? `<div class="img-dots"><span class="img-dot active"></span><span class="img-dot-more">+${imgCount-1}</span></div>` : '';
        // Tags徽章（hot/new）
        const tags = p.tags || [];
        const tagBadges = tags.map(t => {
            if (t === 'hot') return '<span class="tag-hot">HOT</span>';
            if (t === 'new') return '<span class="tag-new">NEW</span>';
            return '';
        }).join('');
        const badge = p.badge ? `<span class="product-badge">${p.badge}</span>` : '';
        const priceText = p.price ? `$${parseFloat(p.price).toFixed(2)} / unit` : (p.price_range || 'Price on request');
        const cartItem = cart.find(c => c.id === p.id);
        const qty = cartItem ? cartItem.qty : '';
        const clickHandler = imgUrl ? `openLightbox('${imgUrl}', '${p.name.replace(/'/g,"\\'")}', '${(p.sku||'').replace(/'/g,"\\'")}', '${imagesJson}')` : '';
        return `
        <div class="product-card ${inCart ? 'in-cart' : ''}" data-id="${p.id}">
            <div class="product-image" ${clickHandler ? `onclick="${clickHandler}"` : 'style="cursor:default"'}">
                ${imgUrl ? `<img src="${imgUrl}" alt="${p.name}" width="800" height="800" loading="lazy" onerror="this.parentElement.innerHTML='<div class=img-placeholder><svg width=40 height=40 style=\\'color:var(--text-light)\\'><use href=\\'#icon-package\\'></use></svg></div>'">` : `<div class="img-placeholder"><svg width="40" height="40" style="color:var(--text-light)"><use href="#icon-package"/></svg></div>`}
                ${badge}
                ${imgDots}
                ${tagBadges ? `<div class="tag-badges">${tagBadges}</div>` : ''}
            </div>
            <div class="product-info">
                ${p.sku ? `<div class="product-sku">${p.sku}</div>` : ''}
                <a href="/product/${(p.sku||'').replace(/'/g,"\\'")}/" class="product-name" title="${p.name}" onclick="event.stopPropagation()">${p.name}</a>
                <div class="product-price">${priceText}</div>
                <div class="card-bottom">
                    <button class="card-qty-btn" onclick="event.stopPropagation();cardQtyChange('${p.id}',-1)" title="-${QTY_STEP}">
                        <svg width="12" height="12"><use href="#icon-minus"/></svg>
                    </button>
                    <input type="number" min="${QTY_STEP}" step="${QTY_STEP}" value="${qty || QTY_STEP}"
                        class="qty-input-card"
                        id="qty-${p.id}"
                        autocomplete="off"
                        inputmode="numeric"
                        onclick="event.stopPropagation()"
                        placeholder=""
                        data-step="${QTY_STEP}">
                    <button class="card-qty-btn" onclick="event.stopPropagation();cardQtyChange('${p.id}',1)" title="+${QTY_STEP}">
                        <svg width="12" height="12"><use href="#icon-plus"/></svg>
                    </button>
                    <button class="add-to-cart ${inCart ? 'in-cart-btn' : ''}"
                        onclick="event.stopPropagation();handleCartClick('${p.id}')">
                        ${inCart ? '&#10003;' : '+'}
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
    
    // 如果还有更多产品，添加"加载更多"按钮
    if (visibleCount < filteredProducts.length) {
        html += `
            <div class="load-more-container">
                <button class="load-more-btn" onclick="loadMoreProducts()">
                    Load More (${filteredProducts.length - visibleCount} more)
                </button>
            </div>`;
    }
    
    grid.innerHTML = html;
}

function loadMoreProducts() {
    visibleCount += PAGE_SIZE;
    renderProducts();
}

// ============ CART ============
function cardQtyChange(id, delta) {
    const qtyInput = document.getElementById('qty-' + id);
    if (!qtyInput) return;
    let qty = parseInt(qtyInput.value) || QTY_STEP;
    qty = Math.max(QTY_STEP, qty + delta * QTY_STEP);
    qtyInput.value = qty;
}

function handleCartClick(id) {
    const qtyInput = document.getElementById('qty-' + id);
    const rawVal = qtyInput ? qtyInput.value : '';
    // Round up to nearest step
    let qty = parseInt(rawVal) || QTY_STEP;
    if (qty < QTY_STEP) qty = QTY_STEP;
    qty = Math.ceil(qty / QTY_STEP) * QTY_STEP;

    const product = allProducts.find(p => p.id === id);
    if (!product) return;

    const existing = cart.find(c => c.id === id);
    if (existing) {
        cart = cart.filter(c => c.id !== id);
        showToast('Removed from cart', 'default');
    } else {
        cart.push({
            id, qty,
            name: product.name,
            sku: product.sku,
            price: product.price || 0,
            description: product.description || '',
            images: product.images || [],
            // PI 完整字段（后端用下划线前缀）
            _costPrice: product._costPrice || (product.price * 0.6),
            _costNote: product._costNote || '',
            _orderNo: product._orderNo || '',
            _stockQty: product._stockQty || '-',
            _unitSize: product._unitSize || '',
            _pcsPerCtn: product._pcsPerCtn || '-',
            _ctnL: product._ctnL || '-',
            _ctnW: product._ctnW || '-',
            _ctnH: product._ctnH || '-',
            _cbm: product._cbm || '-',
            _nw: product._nw || '-',
            _gw: product._gw || '-'
        });
        showToast(`Added: ${product.name} × ${qty}`, 'success');
    }
    updateCartUI();
    renderProducts();
}

function updateCartUI() {
    const badge = document.getElementById('cartBadge');
    const count = cart.reduce((s, c) => s + c.qty, 0);
    badge.textContent = count;
    badge.classList.toggle('empty', count === 0);

    const cartItems = document.getElementById('cartItems');
    const cartFooter = document.getElementById('cartFooter');
    const cartTotal = document.getElementById('cartTotal');
    const cartItemCount = document.getElementById('cartItemCount');

    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="cart-empty">
                <svg width="48" height="48" style="color:var(--text-light)"><use href="#icon-package"/></svg>
                <p>Your inquiry cart is empty.<br>Browse products and add items.</p>
            </div>`;
        cartFooter.style.display = 'none';
        return;
    }

    cartFooter.style.display = 'block';
    cartItemCount.textContent = `${cart.length} product${cart.length > 1 ? 's' : ''} selected`;

    let subtotal = 0;
    cartItems.innerHTML = cart.map(item => {
        const itemSubtotal = (item.price || 0) * item.qty;
        subtotal += itemSubtotal;
        const img = item.images && item.images[0] ? item.images[0] : '';
        return `
        <div class="cart-item">
            <div class="cart-item-img">
                ${img ? `<img src="${img}" alt="${item.name}" onerror="this.style.display='none'">` : ''}
            </div>
            <div class="cart-item-info">
                <div class="cart-item-name" title="${item.name}">${item.name}</div>
                ${item.sku ? `<div class="cart-item-sku">${item.sku}</div>` : ''}
                <div class="cart-item-price">${item.price ? '$' + parseFloat(item.price).toFixed(2) + ' / unit' : 'Price on request'}</div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="changeQty('${item.id}', -1)">
                        <svg width="14" height="14"><use href="#icon-minus"/></svg>
                    </button>
                    <input type="number" min="${QTY_STEP}" step="${QTY_STEP}" class="qty-input" value="${item.qty}" onchange="updateQty('${item.id}', this.value)">
                    <button class="qty-btn" onclick="changeQty('${item.id}', 1)">
                        <svg width="14" height="14"><use href="#icon-plus"/></svg>
                    </button>
                </div>
                ${item.price ? `<div class="cart-item-subtotal">Subtotal: $${itemSubtotal.toFixed(2)}</div>` : ''}
            </div>
            <button class="cart-item-remove" onclick="removeFromCart('${item.id}')">Remove</button>
        </div>`;
    }).join('');

    cartTotal.textContent = subtotal > 0 ? `$${subtotal.toFixed(2)}` : 'Price on request';
}

function changeQty(id, delta) {
    const item = cart.find(c => c.id === id);
    if (!item) return;
    item.qty = Math.max(QTY_STEP, item.qty + delta * QTY_STEP);
    updateCartUI();
}

function updateQty(id, val) {
    const item = cart.find(c => c.id === id);
    if (!item) return;
    let qty = parseInt(val) || QTY_STEP;
    if (qty < QTY_STEP) qty = QTY_STEP;
    qty = Math.ceil(qty / QTY_STEP) * QTY_STEP;
    item.qty = qty;
    updateCartUI();
}

function removeFromCart(id) {
    cart = cart.filter(c => c.id !== id);
    updateCartUI();
    renderProducts();
    showToast('Removed from cart', 'default');
}

function toggleCart() {
    document.getElementById('cartOverlay').classList.toggle('active');
    document.getElementById('cartSidebar').classList.toggle('open');
}

// ============ MODALS ============
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function openInquiryModal() {
    if (cart.length === 0) return;
    toggleCart();
    setTimeout(() => {
        document.getElementById('inquiryModal').classList.add('active');
        renderInquirySummary();
        document.getElementById('inquiryFormContent').style.display = 'block';
        document.getElementById('inquirySuccessContent').style.display = 'none';
    }, 100);
}
function closeInquiryModal() { document.getElementById('inquiryModal').classList.remove('active'); }

function renderInquirySummary() {
    const el = document.getElementById('inquirySummary');
    el.innerHTML = `<h4>Selected Products (${cart.length})</h4>` +
        cart.map(item => {
            const sub = item.price ? `$${(item.price * item.qty).toFixed(2)}` : '—';
            return `<div class="inquiry-summary-item">
                <span class="name">${item.sku ? '['+item.sku+'] ' : ''}${item.name} × ${item.qty}</span>
                <span class="subtotal">${sub}</span>
            </div>`;
        }).join('');
}

async function submitInquiry(e) {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    const payload = {
        contact: {
            name: document.getElementById('buyerName').value.trim(),
            company: document.getElementById('buyerCompany').value.trim(),
            email: document.getElementById('buyerEmail').value.trim(),
            country: document.getElementById('buyerCountry').value.trim(),
            phone: document.getElementById('buyerPhone').value.trim(),
            message: document.getElementById('buyerNotes').value.trim()
        },
        cart: cart.map(c => ({
            id: c.id, sku: c.sku, name: c.name, description: c.description || '',
            quantity: c.qty, price: c.price || 0,
            images: c.images || [],
            // PI 完整字段
            _costPrice: c._costPrice || 0,
            _costNote: c._costNote || '',
            _orderNo: c._orderNo || '',
            _stockQty: c._stockQty || '-',
            _unitSize: c._unitSize || '',
            _ctnL: c._ctnL || '-',
            _ctnW: c._ctnW || '-',
            _ctnH: c._ctnH || '-',
            _pcsPerCtn: c._pcsPerCtn || '-',
            _cbm: c._cbm || '-',
            _nw: c._nw || '-',
            _gw: c._gw || '-'
        })),
        send_email: true,
        timestamp: new Date().toISOString()
    };

    try {
        const resp = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!resp.ok) {
            const err = await resp.json().catch(()=>({}));
            throw new Error(err.error || 'Server error');
        }
        document.getElementById('inquiryFormContent').style.display = 'none';
        document.getElementById('inquirySuccessContent').style.display = 'block';
        cart = [];
        updateCartUI();
    } catch (err) {
        showToast('Failed: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Send Inquiry';
    }
}

// ============ LIGHTBOX ============
function openLightbox(url, name, sku, imagesJson) {
    if (!url) return;
    // Update URL for deep link
    if (sku) history.replaceState(null, '', '/product/' + sku + '/');
    const images = imagesJson ? JSON.parse(decodeURIComponent(imagesJson)) : [url];
    window._lbImages = images;
    window._lbIdx = images.indexOf(url);
    if (window._lbIdx < 0) window._lbIdx = 0;
    _lbRender();
    const lightboxInfoEl = document.getElementById('lightboxInfo');
    if (lightboxInfoEl) lightboxInfoEl.textContent = (sku ? '['+sku+'] ' : '') + (name || '');
    const prevBtn = document.getElementById('lbPrev');
    const nextBtn = document.getElementById('lbNext');
    if (prevBtn) prevBtn.style.display = images.length > 1 ? '' : 'none';
    if (nextBtn) nextBtn.style.display = images.length > 1 ? '' : 'none';
    const lightboxEl = document.getElementById('lightbox');
    if (lightboxEl) lightboxEl.classList.add('active');
    _lbInitTouch();
}
function _lbRender() {
    const imgs = window._lbImages || [];
    const idx = window._lbIdx || 0;
    const lightboxImgEl = document.getElementById('lightboxImg');
    if (lightboxImgEl) lightboxImgEl.src = imgs[idx] || '';
    // 计数器
    const counter = document.getElementById('lbCounter');
    if (counter) counter.textContent = imgs.length > 1 ? `${idx + 1} / ${imgs.length}` : '';
    // 缩略图
    const thumbs = document.getElementById('lbThumbs');
    if (thumbs) {
        thumbs.innerHTML = imgs.length > 1 ? imgs.map((src, i) =>
            `<img class="lb-thumb${i === idx ? ' active' : ''}" src="${src}" alt="" onclick="lbGoto(${i})">`
        ).join('') : '';
        // 滚动到当前缩略图
        const activeTh = thumbs.querySelector('.lb-thumb.active');
        if (activeTh) activeTh.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}
function lbGoto(idx) {
    const imgs = window._lbImages || [];
    window._lbIdx = (idx + imgs.length) % imgs.length;
    _lbRender();
}
function lbNav(dir) {
    const imgs = window._lbImages || [];
    if (!imgs.length) return;
    window._lbIdx = (window._lbIdx + dir + imgs.length) % imgs.length;
    _lbRender();
}
function closeLightbox() {
    const lightboxEl = document.getElementById('lightbox');
    if (lightboxEl) lightboxEl.classList.remove('active');
    const lightboxImgEl = document.getElementById('lightboxImg');
    if (lightboxImgEl) lightboxImgEl.src = '';
    // Restore URL from current category state
    updateUrlFromState();
}
// Touch滑动支持
function _lbInitTouch() {
    const wrap = document.getElementById('lbMainWrap');
    if (!wrap || wrap._touchInited) return;
    wrap._touchInited = true;
    let startX = 0, startY = 0;
    wrap.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });
    wrap.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        // 只处理明显横向滑动（水平位移>纵向 且 >40px）
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
            lbNav(dx < 0 ? 1 : -1);
        }
    }, { passive: true });
}


// ============ PATH ROUTING ============
function applyRoute() {
    // Check for ?p=SKU query param (from pre-rendered product pages "Inquire" button)
    const urlParams = new URLSearchParams(window.location.search);
    const pParam = urlParams.get('p');
    if (pParam) {
        const product = allProducts.find(pr => pr.sku === pParam || pr.id === pParam);
        if (product) {
            currentTheme = 'all';
            currentSubcat = 'all';
            updateThemePills();
            filterAndRender();
            setTimeout(() => {
                const imgUrl = product.images[0];
                const name = product.name || '';
                const imagesJson = encodeURIComponent(JSON.stringify(product.images || []));
                openLightbox(imgUrl, name, pParam, imagesJson);
            }, 200);
        }
        // Clean URL
        history.replaceState(null, '', '/');
        return;
    }

    const path = window.location.pathname.replace(/\/+$/, ''); // remove trailing slash
    const hash = window.location.hash.slice(1) || '';  // legacy hash support

    // Route from path
    if (path.match(/^\/product\//)) {
        // Product detail: /product/SKU/
        const sku = path.replace('/product/', '').replace(/\/+$/, '');
        currentTheme = 'all';
        currentSubcat = 'all';
        updateThemePills();
        filterAndRender();
        const product = allProducts.find(p => p.id === sku || p.sku === sku);
        if (product && product.images && product.images[0]) {
            setTimeout(() => {
                const imgUrl = product.images[0];
                const name = product.name || '';
                const imagesJson = encodeURIComponent(JSON.stringify(product.images || []));
                openLightbox(imgUrl, name, sku, imagesJson);
            }, 100);
        }
        return;
    }

    // Route from hash (legacy fallback for old bookmarks/shared links)
    if (hash.startsWith('product/')) {
        const sku = hash.replace('product/', '');
        currentTheme = 'all';
        currentSubcat = 'all';
        updateThemePills();
        filterAndRender();
        const product = allProducts.find(p => p.id === sku || p.sku === sku);
        if (product && product.images && product.images[0]) {
            const imgUrl = product.images[0];
            const name = product.name || '';
            const imagesJson = encodeURIComponent(JSON.stringify(product.images || []));
            setTimeout(() => openLightbox(imgUrl, name, sku, imagesJson), 100);
        }
        // Redirect hash to path (301-like)
        history.replaceState(null, '', '/product/' + sku + '/');
        return;
    }

    // Category from path: /Theme/Subcategory or /Theme
    if (path !== '/' && path !== '') {
        const parts = path.split('/').filter(Boolean);
        if (parts.length === 2) {
            const theme = decodeURIComponent(parts[0]);
            const subcat = decodeURIComponent(parts[1]);
            setCategory(theme, subcat);
            return;
        } else if (parts.length === 1) {
            setCategory(decodeURIComponent(parts[0]), 'all');
            return;
        }
    }

    // Category from hash (legacy fallback)
    if (hash.includes('/')) {
        const parts = hash.split('/');
        const theme = decodeURIComponent(parts[0]);
        const subcat = decodeURIComponent(parts[1]);
        setCategory(theme, subcat);
        return;
    } else if (hash) {
        setCategory(decodeURIComponent(hash), 'all');
        return;
    }

    // Default: show all products with Ramadan active
    currentTheme = 'Ramadan';
    currentSubcat = 'all';
    updateThemePills();
    const ramadanList = document.getElementById('sl-Ramadan');
    const ramadanLabel = document.getElementById('tl-Ramadan');
    if (ramadanList) ramadanList.classList.add('open');
    if (ramadanLabel) ramadanLabel.classList.add('open');
    filterAndRender();
}

function updateThemePills() {
    document.querySelectorAll('.theme-pill').forEach(p => {
        p.classList.toggle('active', p.textContent.includes(currentTheme));
    });
    updateSectionTitle();
}

function updateUrlFromState() {
    if (currentTheme === 'all') {
        history.replaceState(null, '', '/');
    } else if (currentSubcat === 'all') {
        history.replaceState(null, '', '/' + encodeURIComponent(currentTheme) + '/');
    } else {
        history.replaceState(null, '', '/' + encodeURIComponent(currentTheme) + '/' + encodeURIComponent(currentSubcat) + '/');
    }
}

// Listen for browser back/forward (popstate replaces hashchange)
window.addEventListener('popstate', () => {
    if (allProducts.length > 0) {
        closeLightbox();
        applyRoute();
    }
});

// ============ TOAST ============
function showToast(msg, type = 'default') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast ' + type;
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => t.classList.remove('show'), 2500);
}

// ============ START ============
init();
