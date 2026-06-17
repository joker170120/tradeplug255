/**
 * TradePlug255 — catalog, cart, WhatsApp checkout
 */
const SEGMENTS = {
  telephones: {
    title: "Phones",
    tagline: "Smartphones",
    lead: "iPhone, Samsung, Pixel and more — new or certified refurbished.",
    api: "/api/products/telephones",
    emoji: "📱"
  },
  laptops: {
    title: "Laptops",
    tagline: "Portable computers",
    lead: "MacBook, office and gaming laptops — performance with style.",
    api: "/api/products/laptops",
    emoji: "💻"
  },
  tablettes: {
    title: "iPad & Tablets",
    tagline: "Tablets",
    lead: "iPad, Samsung Tab and related accessories.",
    api: "/api/products/tablettes",
    emoji: "📲"
  },
  "jeux-video": {
    title: "Gaming",
    tagline: "Consoles & games",
    lead: "PlayStation, Xbox, Nintendo and top games at the best price.",
    api: "/api/products/jeux-video",
    emoji: "🎮"
  },
  accessoires: {
    title: "Accessories",
    tagline: "Audio & protection",
    lead: "Earbuds, chargers, cases and more.",
    api: "/api/products/accessoires",
    emoji: "🎧"
  },
  restreints: {
    title: "Restricted products (+18)",
    tagline: "Adults only",
    lead: "Category reserved for people aged 18 and over.",
    api: "/api/products/restreints",
    emoji: "🔞"
  }
};

const AGE_GATE_KEY = "tradeplug255-age-verified";

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
let currentUser = null;

const body = document.body;
const isHub = body.classList.contains("page-hub");
const isProduits = body.classList.contains("page-produits");
const isPremium = body.classList.contains("page-premium");
const isContact = body.classList.contains("page-contact");
const isProfile = body.classList.contains("page-profile");
const segmentKey = body.dataset.segment || "";
const segment = SEGMENTS[segmentKey] || null;
const requiresAge = body.dataset.requireAge === "true";

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
const ageGateModalEl = document.getElementById("ageGateModal");
const ageGateYesEl = document.getElementById("ageGateYes");
const ageGateNoEl = document.getElementById("ageGateNo");

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

function getProductImages(product) {
  const images = Array.isArray(product?.images) ? product.images.filter(Boolean) : [];
  if (images.length) return images;
  if (product?.image) return [product.image];
  return [];
}

let imageLightboxState = { images: [], index: 0, caption: "" };

function ensureImageLightbox() {
  if (document.getElementById("imageLightbox")) return;

  const lightbox = document.createElement("div");
  lightbox.id = "imageLightbox";
  lightbox.className = "image-lightbox";
  lightbox.hidden = true;
  lightbox.innerHTML = `
    <div class="image-lightbox__backdrop" data-lightbox-close></div>
    <div class="image-lightbox__dialog" role="dialog" aria-modal="true" aria-label="Product image preview">
      <button type="button" class="image-lightbox__close" data-lightbox-close aria-label="Close">×</button>
      <button type="button" class="image-lightbox__nav image-lightbox__nav--prev" id="imageLightboxPrev" aria-label="Previous image" hidden>‹</button>
      <img id="imageLightboxImg" class="image-lightbox__img" src="" alt="">
      <button type="button" class="image-lightbox__nav image-lightbox__nav--next" id="imageLightboxNext" aria-label="Next image" hidden>›</button>
      <p id="imageLightboxCaption" class="image-lightbox__caption"></p>
    </div>`;
  document.body.appendChild(lightbox);

  lightbox.querySelectorAll("[data-lightbox-close]").forEach((el) => {
    el.addEventListener("click", closeImageLightbox);
  });
  document.getElementById("imageLightboxPrev")?.addEventListener("click", () => stepImageLightbox(-1));
  document.getElementById("imageLightboxNext")?.addEventListener("click", () => stepImageLightbox(1));
}

function paintImageLightbox() {
  const lightbox = document.getElementById("imageLightbox");
  const imgEl = document.getElementById("imageLightboxImg");
  const captionEl = document.getElementById("imageLightboxCaption");
  const prevBtn = document.getElementById("imageLightboxPrev");
  const nextBtn = document.getElementById("imageLightboxNext");
  if (!lightbox || !imgEl) return;

  const { images, index, caption } = imageLightboxState;
  const src = images[index] || "";
  imgEl.src = src;
  imgEl.alt = caption ? `${caption} — image ${index + 1}` : `Product image ${index + 1}`;
  if (captionEl) {
    const counter = images.length > 1 ? ` (${index + 1}/${images.length})` : "";
    captionEl.textContent = caption ? `${caption}${counter}` : "";
  }
  if (prevBtn) prevBtn.hidden = images.length <= 1;
  if (nextBtn) nextBtn.hidden = images.length <= 1;
}

function openImageLightbox(images, startIndex, caption) {
  const list = (Array.isArray(images) ? images : []).filter(Boolean);
  if (!list.length) return;

  ensureImageLightbox();
  imageLightboxState = {
    images: list,
    index: Math.min(Math.max(startIndex || 0, 0), list.length - 1),
    caption: String(caption || "")
  };
  paintImageLightbox();

  const lightbox = document.getElementById("imageLightbox");
  if (!lightbox) return;
  lightbox.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeImageLightbox() {
  const lightbox = document.getElementById("imageLightbox");
  if (!lightbox || lightbox.hidden) return;
  lightbox.hidden = true;
  const imgEl = document.getElementById("imageLightboxImg");
  if (imgEl) imgEl.src = "";
  if (!cartDrawerEl || cartDrawerEl.hidden) {
    document.body.style.overflow = "";
  }
}

function stepImageLightbox(delta) {
  const { images, index } = imageLightboxState;
  if (images.length <= 1) return;
  imageLightboxState.index = (index + delta + images.length) % images.length;
  paintImageLightbox();
}

function isImageLightboxOpen() {
  const lightbox = document.getElementById("imageLightbox");
  return Boolean(lightbox && !lightbox.hidden);
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

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function refreshAuth() {
  try {
    const data = await fetchJson("/api/auth/me");
    currentUser = data.authed ? data.user : null;
  } catch {
    currentUser = null;
  }
  return currentUser;
}

function getRedirectUrl() {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get("redirect");
  if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) {
    return redirect;
  }
  return null;
}

async function requireLoginForCheckout() {
  if (!currentUser) await refreshAuth();
  if (currentUser) return true;
  const redirect = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/profile/?redirect=${redirect}`;
  return false;
}

async function createPendingOrder(items, orderInfo, segment) {
  return postJson("/api/orders", { items, orderInfo, segment });
}

function orderItemsFromCart() {
  return cart.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    qty: item.qty,
    currencySymbol: item.currencySymbol || site.currencySymbol
  }));
}

function orderItemsFromProduct(product) {
  return [{
    id: product.id,
    name: product.name,
    price: product.price,
    qty: 1,
    currencySymbol: product.currencySymbol || site.currencySymbol
  }];
}

async function reserveAndOpenWhatsApp(items, orderInfo, message, segment) {
  if (!(await requireLoginForCheckout())) return;
  await createPendingOrder(items, orderInfo, segment || segmentKey || "");
  openWhatsApp(message);
  setStatus("Reservation saved. Confirm your purchase in My account after WhatsApp.", true);
}

async function handleCartCheckout() {
  if (!cart.length) {
    setStatus("Your cart is empty.", false);
    return;
  }
  const orderInfo = getOrderInfo();
  const message = buildCartWhatsAppMessage(orderInfo);
  try {
    await reserveAndOpenWhatsApp(orderItemsFromCart(), orderInfo, message, segmentKey);
    cart = [];
    saveCart();
    closeCartDrawer();
  } catch (err) {
    setStatus(err.message || "Could not save reservation.", false);
  }
}

async function handleProductOrder(product) {
  const orderInfo = getOrderInfo();
  const message = buildProductWhatsAppMessage(product, orderInfo);
  try {
    await reserveAndOpenWhatsApp(orderItemsFromProduct(product), orderInfo, message, segmentKey);
  } catch (err) {
    setStatus(err.message || "Could not save reservation.", false);
  }
}

function injectProfileLink() {
  const foot = document.querySelector(".cart-drawer__foot");
  if (!foot || foot.querySelector("[data-profile-link]")) return;
  const link = document.createElement("a");
  link.href = "/profile/";
  link.className = "btn btn--ghost btn--block profile-cart-link";
  link.setAttribute("data-profile-link", "true");
  link.textContent = currentUser ? "My account" : "Sign in / My account";
  foot.insertBefore(link, foot.firstChild);
}

function updateProfileLink() {
  const link = document.querySelector("[data-profile-link]");
  if (link) {
    link.textContent = currentUser ? "My account" : "Sign in / My account";
  } else {
    injectProfileLink();
  }
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
  updateProfileLink();

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
    "Products ship from China to Tanzania.",
    "Delivery possible in under one week (subject to availability and destination)."
  );

  const infoLines = [];
  if (orderInfo?.name) infoLines.push(`Name: ${orderInfo.name}`);
  if (orderInfo?.phone) infoLines.push(`WhatsApp: ${orderInfo.phone}`);
  if (orderInfo?.city) infoLines.push(`City: ${orderInfo.city}`);
  if (orderInfo?.address) infoLines.push(`Address: ${orderInfo.address}`);
  if (orderInfo?.notes) infoLines.push(`Notes: ${orderInfo.notes}`);

  if (infoLines.length) {
    lines.push("", "*Your details:*");
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
    const images = getProductImages(product);
    const img = images[0] || "";
    const card = document.createElement("article");
    card.className = "product-card";
    card.innerHTML = `
      <div class="product-card__media${img ? " product-card__media--zoomable" : ""}">
        ${
          img
            ? `<button type="button" class="product-card__zoom" data-zoom-product="${escapeHtml(product.id)}" aria-label="View ${escapeHtml(product.name)} in full size">
                <img src="${escapeHtml(img)}" alt="${escapeHtml(product.name)}" loading="lazy" />
                <span class="product-card__zoom-hint" aria-hidden="true">Tap to enlarge</span>
              </button>`
            : `<span class="product-card__placeholder">${segment?.emoji || "📦"}<br/>Image coming soon</span>`
        }
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
      if (product) handleProductOrder(product);
    });
  });
  productListEl.querySelectorAll("[data-zoom-product]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const product = products.find((entry) => entry.id === btn.getAttribute("data-zoom-product"));
      if (!product) return;
      const images = getProductImages(product);
      if (images.length) openImageLightbox(images, 0, product.name);
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
    handleCartCheckout();
  });

  waFloatEl?.addEventListener("click", (e) => {
    e.preventDefault();
    const msg = cart.length
      ? buildCartWhatsAppMessage(getOrderInfo())
      : `Hello ${site.shopName},\n\nI would like more information about your products.\n\nThank you!`;
    openWhatsApp(msg);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (isImageLightboxOpen()) {
      closeImageLightbox();
      return;
    }
    if (cartDrawerEl && !cartDrawerEl.hidden) closeCartDrawer();
  });
}

async function initHub() {
  const siteData = await fetchJson("/data/site.json");
  site = { ...site, ...siteData };
  const brandName = document.querySelector(".brand__name");
  if (brandName) brandName.textContent = site.shopName;
  applySocialLinks("homeSocialLinks", site.social);
}

function applySocialLinks(containerId, social) {
  const container = document.getElementById(containerId);
  if (!container || !social) return;
  const map = {
    whatsapp: social.whatsapp,
    instagram: social.instagram,
    tiktok: social.tiktok,
    facebook: social.facebook,
    youtube: social.youtube,
    linkedin: social.linkedin
  };
  container.querySelectorAll("a.social-links__btn").forEach((link) => {
    const cls = [...link.classList].find((c) => c.startsWith("social-links__btn--"));
    if (!cls) return;
    const key = cls.replace("social-links__btn--", "");
    const keyMap = { wa: "whatsapp", ig: "instagram", tt: "tiktok", fb: "facebook", yt: "youtube", li: "linkedin" };
    const url = map[keyMap[key] || key];
    if (url) link.href = url;
    else if (key !== "wa") link.style.display = "none";
  });
}

async function initContact() {
  const siteData = await fetchJson("/data/site.json");
  site = { ...site, ...siteData };
  document.title = `${site.shopName} — Contact`;

  const phoneEl = document.getElementById("contactPhone");
  if (phoneEl) {
    phoneEl.innerHTML = `<a href="tel:${toDigits(site.phone || site.whatsappSeller)}">${escapeHtml(site.phone || site.whatsappSeller)}</a>`;
  }
  const waEl = document.getElementById("contactWhatsApp");
  if (waEl) {
    const waUrl = site.social?.whatsapp || `https://wa.me/${toDigits(site.whatsappSeller)}`;
    waEl.innerHTML = `<a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener">Open WhatsApp</a>`;
  }
  const emailEl = document.getElementById("contactEmail");
  if (emailEl && site.email) {
    emailEl.innerHTML = `<a href="mailto:${escapeHtml(site.email)}">${escapeHtml(site.email)}</a>`;
  }
  const locEl = document.getElementById("contactLocation");
  if (locEl && site.location) locEl.textContent = site.location;

  applySocialLinks("contactSocialLinks", site.social);
  const social = site.social || {};
  if (social.youtube) {
    const ytBtn = document.querySelector("#contactSocialLinks .social-links__btn--disabled[title*='YouTube']");
    if (ytBtn) {
      ytBtn.outerHTML = `<a href="${escapeHtml(social.youtube)}" class="social-links__btn social-links__btn--yt" target="_blank" rel="noopener">YouTube</a>`;
    }
  }
  if (social.linkedin) {
    const liBtn = document.querySelector("#contactSocialLinks .social-links__btn--disabled[title*='LinkedIn']");
    if (liBtn) {
      liBtn.outerHTML = `<a href="${escapeHtml(social.linkedin)}" class="social-links__btn social-links__btn--li" target="_blank" rel="noopener">LinkedIn</a>`;
    }
  }
}

async function initPremium() {
  const siteData = await fetchJson("/data/site.json");
  site = { ...site, ...siteData };
  document.title = `${site.shopName} — Premium`;

  const tbody = document.getElementById("premiumTableBody");
  if (!tbody) return;
  const suppliers = Array.isArray(siteData.premiumSuppliers) ? siteData.premiumSuppliers : [];
  if (!suppliers.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">No suppliers yet.</td></tr>';
    return;
  }
  tbody.innerHTML = suppliers
    .map(
      (s) => `<tr>
        <td><strong>${escapeHtml(s.name)}</strong></td>
        <td>${escapeHtml(s.location)}</td>
        <td>${escapeHtml(s.category)}</td>
        <td>${s.verified ? '<span class="badge badge--verified">Verified</span>' : '<span class="badge badge--pending">Pending</span>'}</td>
        <td>${escapeHtml(s.contact)}</td>
        <td>${escapeHtml(s.moq)}</td>
        <td>${escapeHtml(s.notes)}</td>
      </tr>`
    )
    .join("");
}

function isAgeVerified() {
  try {
    return localStorage.getItem(AGE_GATE_KEY) === "yes";
  } catch {
    return false;
  }
}

function setAgeVerified() {
  try {
    localStorage.setItem(AGE_GATE_KEY, "yes");
  } catch {
    /* ignore */
  }
}

function showAgeGate() {
  if (!ageGateModalEl) return;
  ageGateModalEl.hidden = false;
  document.body.style.overflow = "hidden";
}

function hideAgeGate() {
  if (!ageGateModalEl) return;
  ageGateModalEl.hidden = true;
  document.body.style.overflow = "";
}

function bindAgeGate() {
  let pendingAgeHref = null;

  if (requiresAge && !isAgeVerified()) {
    showAgeGate();
    document.querySelector("main")?.setAttribute("hidden", "");
  }

  ageGateYesEl?.addEventListener("click", () => {
    setAgeVerified();
    hideAgeGate();
    document.querySelector("main")?.removeAttribute("hidden");
    if (pendingAgeHref) {
      window.location.href = pendingAgeHref;
      pendingAgeHref = null;
    }
  });

  ageGateNoEl?.addEventListener("click", () => {
    window.location.href = "/produits/";
  });

  document.querySelectorAll("[data-age-gate-link]").forEach((link) => {
    link.addEventListener("click", (e) => {
      if (isAgeVerified()) return;
      e.preventDefault();
      pendingAgeHref = link.getAttribute("href");
      showAgeGate();
    });
  });
}

function formatOrderDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return value;
  }
}

function renderOrderCard(order, { showConfirm = false } = {}) {
  const itemsHtml = (order.items || [])
    .map(
      (item) =>
        `<li>${escapeHtml(item.name)} × ${item.qty} — ${formatPrice(item.price * item.qty, item.currencySymbol)}</li>`
    )
    .join("");
  const info = order.orderInfo || {};
  const details = [
    info.name ? `Name: ${escapeHtml(info.name)}` : "",
    info.phone ? `WhatsApp: ${escapeHtml(info.phone)}` : "",
    info.city ? `City: ${escapeHtml(info.city)}` : "",
    info.address ? `Address: ${escapeHtml(info.address)}` : "",
    info.notes ? `Notes: ${escapeHtml(info.notes)}` : ""
  ].filter(Boolean);

  return `
    <article class="order-card">
      <div class="order-card__head">
        <div>
          <p class="order-card__date">${formatOrderDate(order.createdAt)}</p>
          <p class="order-card__total">Total: ${formatPrice(order.total, order.currencySymbol)}</p>
        </div>
        <span class="order-card__status order-card__status--${escapeHtml(order.status)}">${escapeHtml(order.status)}</span>
      </div>
      <ul class="order-card__items">${itemsHtml}</ul>
      ${details.length ? `<div class="order-card__details">${details.map((line) => `<p>${line}</p>`).join("")}</div>` : ""}
      ${
        showConfirm
          ? `<button type="button" class="btn btn--primary btn--block" data-confirm-order="${escapeHtml(order.id)}">Confirm my purchase</button>`
          : ""
      }
    </article>`;
}

function paintOrdersList(container, orders, emptyText, showConfirm) {
  if (!container) return;
  if (!orders.length) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
    return;
  }
  container.innerHTML = orders.map((order) => renderOrderCard(order, { showConfirm })).join("");
  if (showConfirm) {
    container.querySelectorAll("[data-confirm-order]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const orderId = btn.getAttribute("data-confirm-order");
        btn.disabled = true;
        try {
          await postJson(`/api/orders/${orderId}/confirm`, {});
          setStatus("Purchase confirmed and added to your history.", true);
          await loadProfileOrders();
        } catch (err) {
          setStatus(err.message || "Could not confirm order.", false);
          btn.disabled = false;
        }
      });
    });
  }
}

async function loadProfileOrders() {
  const [pendingData, historyData] = await Promise.all([
    fetchJson("/api/orders/pending"),
    fetchJson("/api/orders/history")
  ]);
  paintOrdersList(
    document.getElementById("pendingOrdersList"),
    pendingData.orders || [],
    "No pending orders.",
    true
  );
  paintOrdersList(
    document.getElementById("historyOrdersList"),
    historyData.orders || [],
    "No confirmed orders yet.",
    false
  );
}

function showProfileGuest() {
  document.getElementById("profileGuest")?.removeAttribute("hidden");
  document.getElementById("profileAuthed")?.setAttribute("hidden", "");
}

function showProfileAuthed(user) {
  document.getElementById("profileGuest")?.setAttribute("hidden", "");
  const authed = document.getElementById("profileAuthed");
  authed?.removeAttribute("hidden");
  const nameEl = document.getElementById("profileUserName");
  const emailEl = document.getElementById("profileUserEmail");
  if (nameEl) nameEl.textContent = user?.name || "—";
  if (emailEl) emailEl.textContent = user?.email || "—";
}

async function initProfile() {
  const siteData = await fetchJson("/data/site.json");
  site = { ...site, ...siteData };
  document.title = `${site.shopName} — My account`;

  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const logoutBtn = document.getElementById("logoutBtn");

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = await postJson("/api/auth/login", {
        email: document.getElementById("loginEmail")?.value,
        password: document.getElementById("loginPassword")?.value
      });
      currentUser = data.user;
      showProfileAuthed(currentUser);
      await loadProfileOrders();
      setStatus("Signed in successfully.", true);
      const redirect = getRedirectUrl();
      if (redirect) window.location.href = redirect;
    } catch (err) {
      setStatus(err.message || "Sign in failed.", false);
    }
  });

  registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const data = await postJson("/api/auth/register", {
        name: document.getElementById("registerName")?.value,
        email: document.getElementById("registerEmail")?.value,
        password: document.getElementById("registerPassword")?.value
      });
      currentUser = data.user;
      showProfileAuthed(currentUser);
      await loadProfileOrders();
      setStatus("Account created successfully.", true);
      const redirect = getRedirectUrl();
      if (redirect) window.location.href = redirect;
    } catch (err) {
      setStatus(err.message || "Registration failed.", false);
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    try {
      await postJson("/api/auth/logout", {});
      currentUser = null;
      showProfileGuest();
      setStatus("Signed out.", true);
    } catch (err) {
      setStatus(err.message || "Could not sign out.", false);
    }
  });

  await refreshAuth();
  if (currentUser) {
    showProfileAuthed(currentUser);
    await loadProfileOrders();
  } else {
    showProfileGuest();
  }
}

function initProduits() {
  bindAgeGate();
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
bindAgeGate();
injectProfileLink();
refreshAuth().then(() => updateProfileLink());
paintCartUi();

let boot;
if (isHub) boot = initHub();
else if (isPremium) boot = initPremium();
else if (isContact) boot = initContact();
else if (isProfile) boot = initProfile();
else if (isProduits) boot = Promise.resolve(initProduits());
else boot = initCatalog();
boot.catch((err) => setStatus(err.message || "Loading error", false));
