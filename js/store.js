// Crick Store JS v2 — with image fallback, product detail page, Google Sheets

let cart = {};
let currentCat = 'all';
let checkoutMode = false;
let currentProductId = null;

// Export globally for pullGlobalData/sync
window.renderProducts = renderProducts;

document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.pullGlobalData === 'function') window.pullGlobalData();
  cart = JSON.parse(localStorage.getItem('cricpro_cart') || '{}');
  // Reset DB to new products (only wipe plain/old-format cache, never secure admin-saved products)
  if (!localStorage.getItem('cricpro_products_v2')) {
    const existingSecure = localStorage.getItem('cricpro_products');
    if (!existingSecure || !existingSecure.startsWith('SECURE_')) {
      localStorage.removeItem('cricpro_products');
    }
    localStorage.setItem('cricpro_products_v2', '1');
  }
  renderProducts();
  updateCartBadge();
});

function sanitizeDesc(desc) {
  if (!desc) return '';
  // If the description starts with data:image, it's likely a leaked source string.
  if (desc.trim().startsWith('data:image/')) return 'No description available.';
  return desc;
}

/* ── Category filter ── */
function filterCat(cat, btn) {
  currentCat = cat;
  document.querySelectorAll('.cat-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderProducts();
}

/* ── Render product grid ── */
function renderProducts() {
  const q = (document.getElementById('store-search')?.value || '').toLowerCase();
  const products = DB.getProducts();
  const filtered = products.filter(p => {
    const catMatch = currentCat === 'all' || p.category === currentCat;
    const qMatch = !q || p.name.toLowerCase().includes(q) || (p.desc || '').toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q);
    return catMatch && qMatch;
  });

  const grid = document.getElementById('products-grid');
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">🛒</div><div class="empty-state-title">No Products Found</div>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const inCart = cart[p.id] || 0;
    
    // Professional SVG fallbacks (Official Icons)
    const fallbacks = {
      bat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="svg-fallback"><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/><path d="m15 5 3 3"/><path d="m7 16-4 4"/></svg>`,
      ball: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="svg-fallback"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20"/><path d="M2 12a14.5 14.5 0 0 0 20 0"/></svg>`,
      gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="svg-fallback"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
      shoes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="svg-fallback"><path d="M3 13V8a2 2 0 0 1 2-2h4l4 2 4 1h4v4l-4 4H5a2 2 0 0 1-2-2Z"/><path d="M11 9v2"/></svg>`,
      bag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="svg-fallback"><path d="M14 2H10a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/><path d="M8 6h8"/><path d="M8 10h8"/></svg>`,
      equipment: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="svg-fallback"><path d="M8 2v20"/><path d="M12 2v20"/><path d="M16 2v20"/><path d="M4 6h16"/><path d="M4 18h16"/></svg>`,
      service: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="svg-fallback"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.77 3.77z"/></svg>`
    };

    const isImg = !!p.img && (/^https?:\/\//i.test(p.img) || /^data:image\//i.test(p.img) || p.img.startsWith('/'));
    const fallbackSvg = fallbacks[p.category] || fallbacks.equipment;
    
    const imgEl = isImg
      ? `<img src="${p.img}" alt="" class="product-img" loading="lazy" /><div class="product-svg-wrap" style="display:none">${fallbackSvg}</div>`
      : `<div class="product-svg-wrap">${fallbackSvg}</div>`;

    const catColor = { bat: '#7c4dff', ball: '#00bcd4', gear: '#ff6d3b', bag: '#00e676', shoes: '#ffd700', equipment: '#ff4081', service: '#e91e9c' };
    const cc = catColor[p.category] || '#888';

    return `<div class="product-card" id="pcard-${p.id}" onclick="openProductDetail('${p.id}')">
      <div class="product-img-wrap" style="border-bottom:1px solid ${cc}22">${imgEl}</div>
      <div class="product-info">
        <div class="product-badge" style="background:${cc}22;color:${cc}">${p.type || p.category}</div>
        <div class="product-name">${p.name}</div>
        <div class="product-desc">${sanitizeDesc(p.desc || '').slice(0, 80)}${p.desc && p.desc.length > 80 ? '…' : ''}</div>
        <div class="star-rating">${'★'.repeat(Math.floor(p.rating))}${'☆'.repeat(5 - Math.floor(p.rating))} <span style="font-size:11px;color:var(--c-muted)">${p.rating}</span></div>
        <div class="product-price">Rs. ${p.price.toLocaleString()}</div>
        ${p.isService ? `<div style="font-size:11px;color:var(--c-muted);margin-bottom:8px">📞 Click for booking details</div>` : ''}
        <div class="product-action" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm" onclick="openProductDetail('${p.id}')">Details</button>
          <button class="btn btn-amber btn-sm" id="add-btn-${p.id}" onclick="addToCart('${p.id}')">
            ${inCart > 0 ? `🛒 ${inCart} in cart` : '+ Add'}
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

/* ── Product detail page (inside) ── */
function openProductDetail(id) {
  currentProductId = id;
  const p = DB.getProducts().find(x => x.id === id);
  if (!p) return;

  const inCart = (typeof cart !== 'undefined' ? cart[p.id] : 0) || 0;

  // Professional SVG fallbacks based on category (consistent with grid)
  const fallbacks = {
    bat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:120px;height:120px;opacity:0.6"><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z"/><path d="m15 5 3 3"/><path d="m7 16-4 4"/></svg>`,
    ball: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:120px;height:120px;opacity:0.6"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20"/><path d="M2 12a14.5 14.5 0 0 0 20 0"/></svg>`,
    gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:120px;height:120px;opacity:0.6"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    shoes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:120px;height:120px;opacity:0.6"><path d="M3 13V8a2 2 0 0 1 2-2h4l4 2 4 1h4v4l-4 4H5a2 2 0 0 1-2-2Z"/><path d="M11 9v2"/></svg>`,
    bag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:120px;height:120px;opacity:0.6"><path d="M14 2H10a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/><path d="M8 6h8"/><path d="M8 10h8"/></svg>`,
    equipment: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:120px;height:120px;opacity:0.6"><path d="M8 2v20"/><path d="M12 2v20"/><path d="M16 2v20"/><path d="M4 6h16"/><path d="M4 18h16"/></svg>`,
    service: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:120px;height:120px;opacity:0.6"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.77 3.77z"/></svg>`
  };

  const isImg = !!p.img && (/^https?:\/\//i.test(p.img) || /^data:image\//i.test(p.img) || p.img.startsWith('/'));
  const fallbackSvg = fallbacks[p.category] || fallbacks.equipment;
  const catColor = { bat: '#7c4dff', ball: '#00bcd4', gear: '#ff6d3b', bag: '#00e676', shoes: '#ffd700', equipment: '#ff4081', service: '#e91e9c' };
  const cc = catColor[p.category] || '#888';

  const imgEl = isImg
    ? `<img src="${p.img}" alt="" loading="lazy" style="max-width:100%;max-height:280px;object-fit:contain;border-radius:12px;margin-bottom:20px" /><div class="product-svg-wrap" style="display:none;justify-content:center;margin-bottom:20px;color:${cc}">${fallbackSvg}</div>`
    : `<div class="product-svg-wrap" style="text-align:center;margin-bottom:20px;color:${cc}">${fallbackSvg}</div>`;

  const detailsHtml = p.details
    ? `<div class="detail-section" style="border-top:1px solid var(--c-border);margin-top:16px;padding-top:16px">
        <div style="font-size:12px;font-weight:700;color:var(--c-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">📋 Service Details</div>
        <pre style="font-size:13px;color:#fff;white-space:pre-wrap;background:rgba(255,255,255,0.04);padding:12px;border-radius:8px;border:1px solid var(--c-border)">${p.details}</pre>
      </div>` : '';

  const stockHtml = p.isService
    ? `<span class="badge badge-green">✅ Available</span>`
    : `<span class="badge ${p.stock > 5 ? 'badge-green' : p.stock > 0 ? 'badge-amber' : 'badge-red'}">${p.stock > 0 ? `In Stock (${p.stock})` : 'Out of Stock'}</span>`;

  document.getElementById('product-detail-content').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <button class="btn btn-ghost btn-sm" onclick="closeProductDetail()">← Back to Store</button>
      <span class="badge" style="background:${cc}22;color:${cc}">${p.type || p.category}</span>
      ${p.brand ? `<span class="badge" style="background:rgba(255,255,255,0.05)">${p.brand}</span>` : ''}
    </div>
    <div style="text-align:center">${imgEl}</div>
    <h2 style="font-size:20px;font-weight:900;margin-bottom:6px">${p.name}</h2>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
      <div style="font-size:28px;font-weight:900;color:${cc}">Rs. ${p.price.toLocaleString()}</div>
      ${stockHtml}
    </div>
    <div style="margin-bottom:8px">${'★'.repeat(Math.floor(p.rating))}${'☆'.repeat(5 - Math.floor(p.rating))}
      <span style="font-size:12px;color:var(--c-muted);margin-left:6px">${p.rating} / 5.0</span></div>
    <div style="font-size:14px;line-height:1.7;color:rgba(255,255,255,0.82);margin-bottom:16px">${sanitizeDesc(p.desc || '')}</div>
    ${detailsHtml}
    <div style="margin-top:22px;display:flex;gap:12px;flex-wrap:wrap">
      <button class="btn btn-amber" style="flex:1" onclick="addToCart('${p.id}')">
        ${inCart > 0 ? `🛒 Add More (${inCart} in cart)` : (p.isService ? '📋 Book This Service' : '+ Add to Cart')}
      </button>
      ${inCart > 0 ? `<button class="btn btn-ghost" onclick="openCart()">🛒 View Cart</button>` : ''}
    </div>`;

  document.getElementById('store-main').style.display = 'none';
  document.getElementById('product-detail-view').style.display = 'block';
  window.scrollTo(0, 0);
}

function closeProductDetail() {
  document.getElementById('product-detail-view').style.display = 'none';
  document.getElementById('store-main').style.display = '';
  renderProducts(); // refresh cart state
}

/* ── Cart ── */
function addToCart(id) {
  const p = DB.getProducts().find(x => x.id === id);
  if (!p) return;
  if (!p.isService && !p.stock) { showToast('❌ Out of stock!', 'error'); return; }
  cart[id] = (cart[id] || 0) + 1;
  localStorage.setItem('cricpro_cart', JSON.stringify(cart));
  updateCartBadge();
  renderProducts();
  showToast(`✅ ${p.name} added!`, 'success');
  // Refresh detail view if open
  if (document.getElementById('product-detail-view').style.display !== 'none') {
    openProductDetail(id);
  }
}

function removeFromCart(id) {
  if (!cart[id]) return;
  cart[id]--;
  if (cart[id] <= 0) delete cart[id];
  localStorage.setItem('cricpro_cart', JSON.stringify(cart));
  updateCartBadge();
  renderCartItems();
  renderProducts();
}

function updateCartBadge() {
  const total = Object.values(cart).reduce((s, v) => s + v, 0);
  document.getElementById('cart-count').textContent = total;
}

function openCart() {
  checkoutMode = false;
  renderCartItems();
  document.getElementById('checkout-form').style.display = 'none';
  document.getElementById('checkout-btn').textContent = 'Proceed to Checkout';
  document.getElementById('modal-cart').style.display = 'flex';
}

function closeCart(e) {
  if (!e || e.target === document.getElementById('modal-cart')) {
    document.getElementById('modal-cart').style.display = 'none';
  }
}

function renderCartItems() {
  const container = document.getElementById('cart-items-list');
  const products = DB.getProducts();
  const keys = Object.keys(cart);

  if (!keys.length) {
    container.innerHTML = `<div style="color:var(--c-muted);text-align:center;padding:28px;font-size:14px">🛒 Your cart is empty</div>`;
    document.getElementById('cart-total-display').textContent = '';
    document.getElementById('checkout-btn').style.display = 'none';
    return;
  }

  let total = 0;
  container.innerHTML = keys.map(id => {
    const p = products.find(x => x.id === id); if (!p) return '';
    const qty = cart[id]; const sub = p.price * qty; total += sub;
    const icon = (p.img && !p.img.startsWith('http')) ? p.img : (p.imgFallback || '🏏');
    return `<div class="cart-item">
      <div class="cart-item-emoji">${icon}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${p.name}</div>
        <div class="cart-item-price">Rs. ${p.price.toLocaleString()} × ${qty} = <strong>Rs. ${sub.toLocaleString()}</strong></div>
      </div>
      <div class="cart-item-ctrl">
        <button class="qty-btn" onclick="removeFromCart('${id}')">−</button>
        <span class="cart-item-qty">${qty}</span>
        <button class="qty-btn" onclick="addToCart('${id}')">+</button>
      </div>
    </div>`;
  }).join('');

  document.getElementById('cart-total-display').innerHTML = `<strong>Total: Rs. ${total.toLocaleString()}</strong> &nbsp;·&nbsp; ${keys.length} item(s)`;
  document.getElementById('checkout-btn').style.display = '';
}

function proceedCheckout() {
  if (!checkoutMode) {
    checkoutMode = true;
    document.getElementById('checkout-form').style.display = '';
    document.getElementById('checkout-btn').textContent = '✅ Place Order';
    return;
  }

  const name = document.getElementById('buyer-name').value.trim();
  const phone = document.getElementById('buyer-phone').value.trim();
  const addr = document.getElementById('buyer-addr').value.trim();
  const note = document.getElementById('buyer-note').value.trim();

  if (!name || !phone) { showToast('❌ Fill name and phone number', 'error'); return; }

  const products = DB.getProducts();
  const items = Object.entries(cart).map(([id, qty]) => {
    const p = products.find(x => x.id === id);
    return { id, name: p?.name, qty, unitPrice: p?.price, subtotal: (p?.price || 0) * qty, category: p?.category };
  });
  const total = items.reduce((s, i) => s + i.subtotal, 0);

  const order = DB.addOrder({ name, phone, address: addr, note, items, total });

  // Clear cart
  cart = {};
  localStorage.removeItem('cricpro_cart');
  updateCartBadge();
  renderProducts();
  document.getElementById('modal-cart').style.display = 'none';

  showToast(`🎉 Order #${order.id} placed! We will call you at ${phone} soon.`, 'success');
  setTimeout(() => {
    document.getElementById('modal-cart').style.display = 'none';
  }, 300);
}
