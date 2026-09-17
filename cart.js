/* ============================================================================
 * Party Maker — 共享询价购物车（Inquiry Cart）
 * 首页 (app.js) 与全部 /product/<SKU>/ 详情页共用这一份存储逻辑。
 *
 * 单一事实源：localStorage key = pm_cart_v1
 * 购物车只在客户主动清空 / 提交询价后才清；刷新、关标签页、跨页面跳转都不丢。
 * 所有存储访问都包了 try/catch：无痕模式 / 配额满 / 数据损坏 → 降级为内存，不报错、不白屏。
 * ==========================================================================*/
(function (window, document) {
    'use strict';

    var KEY = 'pm_cart_v1';
    var STEP = 12;          // 与首页 QTY_STEP 保持一致：数量向上取整到 12 的倍数
    var VERSION = 1;

    /* ---------------------------------------------------------------- helpers */

    /** 数量归一化：非法值→12，不足一步→12，其余向上取整到步长的整数倍 */
    function normalizeQty(val) {
        var qty = parseInt(val, 10);
        if (!qty || qty < STEP) qty = STEP;
        return Math.ceil(qty / STEP) * STEP;
    }

    function cloneItem(it) {
        var copy = {};
        for (var k in it) {
            if (Object.prototype.hasOwnProperty.call(it, k)) copy[k] = it[k];
        }
        return copy;
    }

    function countOf(items) {
        var n = 0;
        (items || []).forEach(function (it) {
            n += parseInt(it && it.qty, 10) || 0;
        });
        return n;
    }

    /* ---------------------------------------------------------------- storage */

    /** 读取购物车。任何异常 → 返回空数组并清掉损坏的存储 */
    function read() {
        try {
            var raw = window.localStorage.getItem(KEY);
            if (!raw) return [];
            var data = JSON.parse(raw);
            var items = Array.isArray(data) ? data
                : (data && Array.isArray(data.items) ? data.items : []);
            return items
                .filter(function (it) { return it && it.id; })
                .map(function (it) {
                    var copy = cloneItem(it);
                    copy.qty = normalizeQty(copy.qty);
                    return copy;
                });
        } catch (e) {
            console.warn('Cart storage unreadable, reset:', e);
            clear();
            return [];
        }
    }

    /** 写入购物车（并刷新所有页面上/下的徽标） */
    function write(items) {
        try {
            window.localStorage.setItem(KEY, JSON.stringify({
                v: VERSION,
                savedAt: Date.now(),
                items: items
            }));
        } catch (e) {
            // 无痕模式 / 配额满：本次会话内仍可用，只是不持久
            console.warn('Cart not persisted:', e);
        }
        renderBadges(countOf(items));
    }

    function clear() {
        try {
            window.localStorage.removeItem(KEY);
        } catch (e) { /* ignore */ }
        renderBadges(0);
    }

    /* ------------------------------------------------------------- operations */

    /** 当前购物车总件数（含所有数量） */
    function count() {
        return countOf(read());
    }

    function getItem(id) {
        var found = null;
        read().forEach(function (it) {
            if (!found && it.id === id) found = it;
        });
        return found;
    }

    function has(id) {
        return !!getItem(id);
    }

    /**
     * 加入购物车（已存在则累加数量）。
     * @returns {'added'|'updated'}
     */
    function add(item, qty) {
        if (!item || !item.id) return 'added';
        var step = normalizeQty(qty);
        var items = read();
        var hit = null;
        items.forEach(function (it) {
            if (it.id === item.id) hit = it;
        });
        if (hit) {
            hit.qty = normalizeQty(hit.qty + step);
            write(items);
            return 'updated';
        }
        var entry = cloneItem(item);
        entry.qty = step;
        items.push(entry);
        write(items);
        return 'added';
    }

    function remove(id) {
        write(read().filter(function (it) { return it.id !== id; }));
    }

    function setQty(id, qty) {
        var items = read();
        items.forEach(function (it) {
            if (it.id === id) it.qty = normalizeQty(qty);
        });
        write(items);
    }

    /* ------------------------------------------------------------------ badges */

    /** 刷新页面上所有购物车徽标（首页 #cartBadge，详情页 [data-cart-badge]） */
    function renderBadges(n) {
        if (n === undefined || n === null) n = count();
        var nodes = document.querySelectorAll('#cartBadge, [data-cart-badge]');
        for (var i = 0; i < nodes.length; i++) {
            nodes[i].textContent = n;
            if (nodes[i].classList) nodes[i].classList.toggle('empty', n === 0);
        }
    }

    /* ------------------------------------------------------- cross-tab sync */

    var listeners = [];

    /** 注册回调：任一本页改动或其它标签页改动都会触发 */
    function onChange(fn) {
        if (typeof fn === 'function') listeners.push(fn);
    }

    // 另一个标签页改了购物车 → 本页跟着更新（否则会把对方刚加的覆盖掉）
    window.addEventListener('storage', function (e) {
        if (e.key !== KEY && e.key !== null) return;
        renderBadges();
        listeners.forEach(function (fn) {
            try { fn(read()); } catch (err) { console.warn(err); }
        });
    });

    /* ------------------------------------------------------------------ export */

    window.PMCart = {
        KEY: KEY,
        STEP: STEP,
        normalizeQty: normalizeQty,
        read: read,
        write: write,
        clear: clear,
        count: count,
        getItem: getItem,
        has: has,
        add: add,
        remove: remove,
        setQty: setQty,
        renderBadges: renderBadges,
        onChange: onChange
    };

    // DOM 就绪后立刻把存量数量显示出来（首页在 app.js 里还会再刷一次，幂等）
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { renderBadges(); });
    } else {
        renderBadges();
    }

})(window, document);
