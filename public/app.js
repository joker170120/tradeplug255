/**
 * TradePlug255 — catalog, cart, WhatsApp checkout
 */
const SEGMENTS = {
  telephones: {
    title: "Phones",
    tagline: "Smartphones & tablets",
    lead: "iPhone, Samsung, Pixel and more — brand new or certified used.",
    api: "/api/products/telephones",
    emoji: "📱"
  },
  laptops: {
    title: "Laptops",
    tagline: "Portable computers",
    lead: "MacBook, gaming and office laptops — performance with style.",
    api: "/api/products/laptops",
    emoji: "💻"
  },
  "jeux-video": {
    title: "Video Games",
    tagline: "Consoles & games",
    lead: "PlayStation, Xbox, Nintendo and top games at the best price.",
    api: "/api/products/jeux-video",
    emoji: "🎮"
  }
};

const CART_KEY = "tradeplug255-cart-v1";
const NO_IMAGE =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect fill="#1a1816" width="100%" height="100%"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#d4af37" font-family="sans-serif" font-size="18">TradePlug255</text></svg>'
  );

let site = {
  shopName: "TradePlug255",
  currencySymbol: "TZS",
  whatsappSeller: "+25574879462"
};
let products = [];
let cart = [];

const body = document.body;
const isHub = body.classList.contains("page-hub");
const segmentKey = body.dataset.segment || "";
const segment = SEGMENTS[segmentKey] || null;

const productListEl = document.getElementById("productList");
const searchInputEl = document.getElementById("searchInput");
const maxPriceInputEl = document.getElementById("maxPriceInput");
const sortPriceInputEl = document.getElementById("sortPriceInput");
const resetFiltersBtnEl = document.getElementById("resetFiltersBtn");
const statusToastEl = document.getElementById("statusToast");
const cartDrawerEl = document.getElementById("cartDrawer");
const cartBackdropEl = document.getElementById("cartBackdrop");
const cartCloseBtnEl = document.getElementById("cartCloseBtn");
const cartListEl = document.getElementById("cartList");
const cartCountEl = document.getElementById("cartCount");
const cartTotalEl = document.getElementById("cartTotal");
const cartCheckoutBtnEl = document.getElementById("cartCheckoutBtn");
const cartClearBtnEl = document.getElementById("cartClearBtn");
const cartToggleBtnEl = document.getElementById("cartToggleBtn");
const waFloatEl = document.getElementById("waFloat");

// Optional order form fields (present on catalog pages).
const orderNameInputEl = document.getElementById("orderNameInput");
const orderPhoneInputEl = document.getElementById("orderPhoneInput");
const orderCityInputEl = document.getElementById("orderCityInput");
const orderAddressInputEl = document.getElementById("orderAddressInput");
const orderNotesInputEl = document.getElementById("orderNotesInput");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function formatPrice(amount, symbol) {
  const s = symbol || site.currencySymbol || "TZS";
  return `${Number(amount).toLocaleString("en-US")} ${s}`;
}

function setStatus(message, ok) {
  if (!statusToastEl) return;
  statusToastEl.textContent = message || "";
  statusToastEl.className =
    "status-toast is-visible" + (message ? (ok ? " is-ok" : " is-err") : "");
  if (message) {
    clearTimeout(setStatus._timer);
    setStatus._timer = setTimeout(() => {
      statusToastEl.className = "status-toast";
    }, 3500);
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

function loadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    cart = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(cart)) cart = [];
  } catch {
    cart = [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  paintCartUi();
}

function changeQty(id, delta) {
  const item = cart.find((entry) => entry.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter((entry) => entry.id !== id);
  saveCart();
}

function removeFromCart(id) {
  cart = cart.filter((entry) => entry.id !== id);
  saveCart();
}

function addToCart(product) {
  const existing = cart.find((entry) => entry.id === product.id);
  if (existing) existing.qty += 1;
  else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      currencySymbol: product.currencySymbol || site.currencySymbol,
      qty: 1
    });
  }
  saveCart();
  setStatus(`${product.name} added to cart.`, true);
}

function paintCartUi() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  if (cartCountEl) {
    cartCountEl.textContent = String(count);
    cartCountEl.hidden = count === 0;
  }

  if (!cartListEl) return;
  cartListEl.innerHTML = "";
  if (!cart.length) {
    cartListEl.innerHTML = '<p class="empty-state">Your cart is empty.</p>';
    if (cartTotalEl) cartTotalEl.textContent = formatPrice(0);
    return;
  }

  let total = 0;
  for (const item of cart) {
    total += item.price * item.qty;
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <div class="cart-item__info">
        <p class="cart-item__name">${escapeHtml(item.name)}</p>
        <p class="cart-item__price">${formatPrice(item.price, item.currencySymbol)}</p>
        <div class="cart-item__qty">
          <button type="button" data-cart-minus="${escapeHtml(item.id)}" aria-label="Decrease quantity">−</button>
          <span>${item.qty}</span>
          <button type="button" data-cart-plus="${escapeHtml(item.id)}" aria-label="Increase quantity">+</button>
          <button type="button" data-cart-remove="${escapeHtml(item.id)}" class="btn btn--ghost" style="margin-left:auto;padding:4px 10px;font-size:0.8rem">Remove</button>
        </div>
      </div>`;
    cartListEl.appendChild(row);
  }

  if (cartTotalEl) cartTotalEl.textContent = formatPrice(total);

  cartListEl.querySelectorAll("[data-cart-minus]").forEach((btn) => {
    btn.addEventListener("click", () => changeQty(btn.getAttribute("data-cart-minus"), -1));
  });
  cartListEl.querySelectorAll("[data-cart-plus]").forEach((btn) => {
    btn.addEventListener("click", () => changeQty(btn.getAttribute("data-cart-plus"), 1));
  });
  cartListEl.querySelectorAll("[data-cart-remove]").forEach((btn) => {
    btn.addEventListener("click", () => removeFromCart(btn.getAttribute("data-cart-remove")));
  });
}

function openCartDrawer() {
  if (!cartDrawerEl) return;
  cartDrawerEl.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeCartDrawer() {
  if (!cartDrawerEl) return;
  cartDrawerEl.hidden = true;
  document.body.style.overflow = "";
}

function normalizeFieldValue(value) {
  return String(value ?? "")
    .trim()
    // Avoid weird spacing when users paste formatted text.
    .replace(/\s+/g, " ");
}

function getOrderInfo() {
  return {
    name: normalizeFieldValue(orderNameInputEl?.value),
    phone: normalizeFieldValue(orderPhoneInputEl?.value),
    city: normalizeFieldValue(orderCityInputEl?.value),
    address: normalizeFieldValue(orderAddressInputEl?.value),
    notes: normalizeFieldValue(orderNotesInputEl?.value),
  };
}

function appendShippingAndOrderInfo(lines, orderInfo) {
  lines.push(
    "",
    "Les appareils viennent de Chine pour la Tanzanie.",
    "Livraison possible en moins d'une semaine (selon disponibilité et destination)."
  );

  const infoLines = [];
  if (orderInfo?.name) infoLines.push(`Nom: ${orderInfo.name}`);
  if (orderInfo?.phone) infoLines.push(`WhatsApp: ${orderInfo.phone}`);
  if (orderInfo?.city) infoLines.push(`Ville: ${orderInfo.city}`);
  if (orderInfo?.address) infoLines.push(`Adresse: ${orderInfo.address}`);
  if (orderInfo?.notes) infoLines.push(`Notes: ${orderInfo.notes}`);

  if (infoLines.length) {
    lines.push("", "*Vos informations:*");
    for (const line of infoLines) lines.push(`• ${line}`);
  }
}

function buildProductWhatsAppMessage(product, orderInfo) {
  const shop = site.shopName || "TradePlug255";

  const lines = [
    `Hello ${shop},`,
    "",
    `I want to order:`,
    "",
    `*${product.name}*`,
    `Price: ${formatPrice(product.price, product.currencySymbol)}`,
  ];

  if (product.condition) lines.push(`Condition: ${product.condition}`);

  appendShippingAndOrderInfo(lines, orderInfo);
  lines.push("", "Thank you!");
  return lines.join("\n");
}

function buildCartWhatsAppMessage(orderInfo) {
  const shop = site.shopName || "TradePlug255";
  const lines = [`Hello ${shop},`, "", "I want to order:", ""];

  let total = 0;
  for (const item of cart) {
    lines.push(`• ${item.name} x${item.qty} — ${formatPrice(item.price * item.qty, item.currencySymbol)}`);
    total += item.price * item.qty;
  }

  lines.push("", `*Total: ${formatPrice(total)}*`);
  appendShippingAndOrderInfo(lines, orderInfo);
  lines.push("", "Thank you!");
  return lines.join("\n");
}

function openWhatsApp(message) {
  const digits = toDigits(site.whatsappSeller);
  if (!digits) throw new Error("WhatsApp number is missing in site config.");
  window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
}

function getFilteredProducts() {
  let list = [...products];
  const q = (searchInputEl?.value || "").trim().toLowerCase();
  const max = Number(maxPriceInputEl?.value);
  const sort = sortPriceInputEl?.value || "none";

  if (q) {
    list = list.filter(
      (product) =>
        String(product.name || "").toLowerCase().includes(q) ||
        String(product.description || "").toLowerCase().includes(q)
    );
  }
  if (Number.isFinite(max) && max > 0) {
    list = list.filter((product) => Number(product.price) <= max);
  }
  if (sort === "asc") list.sort((a, b) => Number(a.price) - Number(b.price));
  if (sort === "desc") list.sort((a, b) => Number(b.price) - Number(a.price));
  return list;
}

function renderProducts() {
  if (!productListEl) return;
  const list = getFilteredProducts();
  productListEl.innerHTML = "";

  if (!list.length) {
    productListEl.innerHTML = '<p class="empty-state">No products found. Try different filters.</p>';
    return;
  }

  for (const product of list) {
    const img = (Array.isArray(product.images) && product.images[0]) || product.image || "";
    const card = document.createElement("article");
    card.className = "product-card";
    card.innerHTML = `
      <div class="product-card__media">
        ${img ? `<img src="${escapeHtml(img)}" alt="" loading="lazy" />` : `<span class="product-card__placeholder">${segment?.emoji || "📦"}<br/>Image coming soon</span>`}
      </div>
      <div class="product-card__body">
        ${product.condition ? `<span class="product-card__condition">${escapeHtml(product.condition)}</span>` : ""}
        <h3 class="product-card__name">${escapeHtml(product.name)}</h3>
        <p class="product-card__desc">${escapeHtml(product.description || "")}</p>
        <p class="product-card__price">${formatPrice(product.price, product.currencySymbol)}</p>
        <div class="product-card__actions">
          <button type="button" class="btn btn--outline" data-add-cart="${escapeHtml(product.id)}">Add to cart</button>
          <button type="button" class="btn btn--whatsapp" data-order-wa="${escapeHtml(product.id)}">Order now</button>
        </div>
      </div>`;

    const imgEl = card.querySelector("img");
    if (imgEl) imgEl.onerror = () => { imgEl.src = NO_IMAGE; };

    productListEl.appendChild(card);
  }

  productListEl.querySelectorAll("[data-add-cart]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const product = products.find((entry) => entry.id === btn.getAttribute("data-add-cart"));
      if (product) addToCart(product);
    });
  });
  productListEl.querySelectorAll("[data-order-wa]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const product = products.find((entry) => entry.id === btn.getAttribute("data-order-wa"));
      if (product) openWhatsApp(buildProductWhatsAppMessage(product, getOrderInfo()));
    });
  });
}

function bindUi() {
  searchInputEl?.addEventListener("input", renderProducts);
  maxPriceInputEl?.addEventListener("input", renderProducts);
  sortPriceInputEl?.addEventListener("change", renderProducts);

  resetFiltersBtnEl?.addEventListener("click", () => {
    if (searchInputEl) searchInputEl.value = "";
    if (maxPriceInputEl) maxPriceInputEl.value = "";
    if (sortPriceInputEl) sortPriceInputEl.value = "none";
    renderProducts();
    setStatus("Filters reset.", true);
  });

  cartToggleBtnEl?.addEventListener("click", openCartDrawer);
  cartCloseBtnEl?.addEventListener("click", closeCartDrawer);
  cartBackdropEl?.addEventListener("click", closeCartDrawer);

  cartClearBtnEl?.addEventListener("click", () => {
    if (!cart.length) return;
    if (confirm("Clear your cart?")) {
      cart = [];
      saveCart();
    }
  });

  cartCheckoutBtnEl?.addEventListener("click", () => {
    if (!cart.length) {
      setStatus("Your cart is empty.", false);
      return;
    }
    openWhatsApp(buildCartWhatsAppMessage(getOrderInfo()));
  });

  waFloatEl?.addEventListener("click", (e) => {
    e.preventDefault();
    const msg = cart.length
      ? buildCartWhatsAppMessage(getOrderInfo())
      : `Hello ${site.shopName},\n\nI would like more information about your products.\n\nThank you!`;
    openWhatsApp(msg);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && cartDrawerEl && !cartDrawerEl.hidden) closeCartDrawer();
  });
}

async function initHub() {
  const siteData = await fetchJson("/data/site.json");
  site = { ...site, ...siteData };
  document.title = `${site.shopName} — Premium tech store`;
  const brandName = document.querySelector(".brand__name");
  if (brandName) brandName.textContent = site.shopName;
}

async function initCatalog() {
  if (!segment) return;
  const [siteData, data] = await Promise.all([
    fetchJson("/data/site.json"),
    fetchJson(segment.api)
  ]);
  site = { ...site, ...siteData };
  products = Array.isArray(data?.products) ? data.products : [];

  document.title = `${site.shopName} — ${segment.title}`;
  const titleEl = document.querySelector("[data-page-title]");
  if (titleEl) titleEl.textContent = segment.title;
  const leadEl = document.querySelector("[data-page-lead]");
  if (leadEl) leadEl.textContent = segment.lead;
  const taglineEl = document.querySelector("[data-page-tagline]");
  if (taglineEl) taglineEl.textContent = segment.tagline;

  renderProducts();
}

loadCart();
bindUi();
paintCartUi();

const boot = isHub ? initHub() : initCatalog();
boot.catch((err) => setStatus(err.message || "Loading error", false));
