function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function productImageList(product) {
  if (Array.isArray(product?.images) && product.images.length) {
    return product.images.filter(Boolean);
  }
  return product?.image ? [product.image] : [];
}

function formatPriceLabel(product) {
  const raw = product?.price;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return `${Number(raw).toLocaleString("en-US")} ${product.currencySymbol || "TZS"}`;
  }
  const text = String(raw ?? "").trim();
  return text || "—";
}

function renderProductPageHtml(product, segment, category, site, canonical) {
  const shopName = String(site.shopName || "TradePlug255");
  const title = `${product.name} — ${shopName}`;
  const description = String(product.description || `${product.name} available on ${shopName}. Order on WhatsApp.`).slice(0, 160);
  const images = productImageList(product);
  const image = images[0] ? (images[0].startsWith("http") ? images[0] : `${canonical.split("/p/")[0]}${images[0]}`) : "";
  const absImages = images.map((src) => (src.startsWith("http") ? src : `${canonical.split("/p/")[0]}${src}`));
  const priceLabel = formatPriceLabel(product);
  const waDigits = String(site.whatsappSeller || "").replace(/\D/g, "");
  const waText = encodeURIComponent(
    `Hello ${shopName},\n\nI'm interested in:\n*${product.name}*\nPrice: ${priceLabel}\nLink: ${canonical}`
  );
  const waHref = waDigits ? `https://wa.me/${waDigits}?text=${waText}` : site.social?.whatsapp || "#";
  const categoryName = category?.name || segment;
  const categoryHref = `/${segment}/`;

  const thumbs = images
    .map(
      (src, i) =>
        `<button type="button" class="pp-thumb${i === 0 ? " is-active" : ""}" data-src="${escapeHtml(src)}" aria-label="Photo ${i + 1}"><img src="${escapeHtml(src)}" alt="" loading="lazy" /></button>`
    )
    .join("");

  const mainImage = images[0]
    ? `<img id="ppMainImage" class="pp-gallery__main" src="${escapeHtml(images[0])}" alt="${escapeHtml(product.name)}" />`
    : `<div class="pp-gallery__placeholder">${escapeHtml(category?.emoji || "📦")}</div>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || description,
    image: absImages,
    sku: product.id,
    brand: { "@type": "Brand", name: shopName },
    offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: product.currencySymbol || "TZS",
      price: String(typeof product.price === "number" ? product.price : 0),
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: shopName }
    }
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:site_name" content="${escapeHtml(shopName)}">
  <meta property="og:type" content="product">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  ${image ? `<meta property="og:image" content="${escapeHtml(image)}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  ${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : ""}
  <link rel="icon" href="/images/logo.png" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
</head>
<body class="page-product"
  data-segment="${escapeHtml(segment)}"
  data-product-id="${escapeHtml(product.id)}"
  data-share-url="${escapeHtml(canonical)}"
  data-share-title="${escapeHtml(product.name)}">
  <header class="site-header">
    <div class="container site-header__inner">
      <a class="brand" href="/" aria-label="${escapeHtml(shopName)} home">
        <img src="/images/logo.png" alt="${escapeHtml(shopName)}" class="brand__logo">
        <div class="brand__text">
          <span class="brand__name">${escapeHtml(shopName)}</span>
          <span class="brand__tagline">Product</span>
        </div>
      </a>
      <nav class="site-nav" aria-label="Navigation">
        <a href="/">Home</a>
        <a href="/produits/">Products</a>
        <a href="${escapeHtml(categoryHref)}" class="is-active">${escapeHtml(categoryName)}</a>
        <a href="/profile/" data-nav-account>Account</a>
        <a href="/contact/">Contact</a>
      </nav>
    </div>
  </header>

  <main class="container main pp-main">
    <nav class="pp-breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a>
      <span aria-hidden="true">/</span>
      <a href="/produits/">Products</a>
      <span aria-hidden="true">/</span>
      <a href="${escapeHtml(categoryHref)}">${escapeHtml(categoryName)}</a>
      <span aria-hidden="true">/</span>
      <span>${escapeHtml(product.name)}</span>
    </nav>

    <article class="pp-layout">
      <div class="pp-gallery">
        <div class="pp-gallery__stage">${mainImage}</div>
        ${thumbs ? `<div class="pp-gallery__thumbs">${thumbs}</div>` : ""}
      </div>

      <div class="pp-info">
        ${product.condition ? `<span class="product-card__condition">${escapeHtml(product.condition)}</span>` : ""}
        <h1 class="pp-title">${escapeHtml(product.name)}</h1>
        <p class="pp-price">${escapeHtml(priceLabel)}</p>
        <p class="pp-desc">${escapeHtml(product.description || "")}</p>

        <div class="pp-actions">
          <a class="btn btn--whatsapp btn--block" href="${escapeHtml(waHref)}" target="_blank" rel="noopener">Order on WhatsApp</a>
          <button type="button" class="btn btn--outline btn--block" id="ppAddCart">Add to cart</button>
        </div>

        <section class="pp-share" aria-labelledby="pp-share-title">
          <h2 id="pp-share-title" class="pp-share__title">Share this product</h2>
          <p class="pp-share__hint">Copy the link and send it on WhatsApp, Instagram, TikTok or Facebook.</p>
          <div class="pp-share__row">
            <input id="ppShareUrl" class="pp-share__input" type="text" readonly value="${escapeHtml(canonical)}" aria-label="Product link">
            <button type="button" id="ppShareCopy" class="btn btn--primary">Copy link</button>
          </div>
          <div class="pp-share__social">
            <a class="btn btn--ghost" href="https://wa.me/?text=${encodeURIComponent(`${product.name} — ${priceLabel}\n${canonical}`)}" target="_blank" rel="noopener">WhatsApp</a>
            <a class="btn btn--ghost" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonical)}" target="_blank" rel="noopener">Facebook</a>
            <a class="btn btn--ghost" href="https://twitter.com/intent/tweet?url=${encodeURIComponent(canonical)}&text=${encodeURIComponent(product.name)}" target="_blank" rel="noopener">X</a>
          </div>
        </section>

        <p class="pp-shipping muted">Products ship from China to Tanzania. Delivery possible in under one week (subject to availability).</p>
      </div>
    </article>
  </main>

  <footer class="site-footer">
    <div class="container site-footer__inner">
      <div class="site-footer__brand">
        <img src="/images/logo.png" alt="${escapeHtml(shopName)}" class="site-footer__logo">
        <span>${escapeHtml(shopName)}</span>
      </div>
      <p class="site-footer__copy">WhatsApp: <a href="https://wa.me/${escapeHtml(waDigits)}">${escapeHtml(site.phone || site.whatsappSeller || "")}</a></p>
    </div>
  </footer>

  <div id="statusToast" class="status-toast" role="status"></div>
  <script type="application/json" id="ppProductJson">${JSON.stringify({ product, segment }).replace(/</g, "\\u003c")}</script>
  <script src="/p/product-page.js" defer></script>
  <script src="/app.js" defer></script>
</body>
</html>`;
}

module.exports = { renderProductPageHtml, escapeHtml, productImageList, formatPriceLabel };
