const form = document.getElementById("productForm");
const productIdInput = document.getElementById("productId");
const segmentInput = document.getElementById("segmentInput");
const listSegmentInput = document.getElementById("listSegmentInput");
const nameInput = document.getElementById("nameInput");
const descriptionInput = document.getElementById("descriptionInput");
const priceInput = document.getElementById("priceInput");
const conditionInput = document.getElementById("conditionInput");
const imagesInput = document.getElementById("imagesInput");
const currentImagesEl = document.getElementById("currentImages");
const productTableWrap = document.getElementById("productTableWrap");
const statusEl = document.getElementById("status");
const resetBtn = document.getElementById("resetBtn");
const refreshBtn = document.getElementById("refreshBtn");
const logoutBtn = document.getElementById("logoutBtn");

let selectedKeepImages = [];
let currentSegmentProducts = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(msg, ok) {
  statusEl.textContent = msg || "";
  statusEl.className = "admin-status" + (msg ? (ok ? " is-ok" : " is-err") : "");
}

function normalizeImageUrl(src) {
  if (!src || typeof src !== "string") return "";
  const s = src.trim();
  if (!s) return "";
  if (s.startsWith("/uploads/")) return s;
  if (/^https?:\/\//i.test(s) && /blob\.vercel-storage\.com/i.test(s)) return s;
  return "";
}

function resetForm() {
  productIdInput.value = "";
  form.reset();
  segmentInput.value = listSegmentInput.value;
  selectedKeepImages = [];
  renderCurrentImages();
}

function renderCurrentImages() {
  currentImagesEl.innerHTML = "";
  if (!selectedKeepImages.length) return;
  for (const src of selectedKeepImages) {
    const item = document.createElement("div");
    item.className = "admin-image-item";
    item.innerHTML = `
      <img src="${escapeHtml(src)}" alt="">
      <button type="button" class="btn btn--ghost" data-remove-image="${escapeHtml(src)}">Remove</button>`;
    const img = item.querySelector("img");
    img.onerror = () => {
      img.src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect fill="#1a1816" width="100%" height="100%"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#d4af37" font-size="14">Image</text></svg>');
    };
    currentImagesEl.appendChild(item);
  }
  currentImagesEl.querySelectorAll("[data-remove-image]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const src = btn.getAttribute("data-remove-image");
      selectedKeepImages = selectedKeepImages.filter((url) => url !== src);
      renderCurrentImages();
    });
  });
}

function fillForm(product, segment) {
  productIdInput.value = product.id || "";
  segmentInput.value = segment;
  nameInput.value = product.name || "";
  descriptionInput.value = product.description || "";
  priceInput.value = Number(product.price || 0);
  conditionInput.value = product.condition || "";
  selectedKeepImages = (Array.isArray(product.images) ? product.images : [product.image])
    .map(normalizeImageUrl)
    .filter(Boolean);
  renderCurrentImages();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderTable(segment, products) {
  currentSegmentProducts = products;
  if (!products.length) {
    productTableWrap.innerHTML = '<p class="empty-state">No products yet for this category.</p>';
    return;
  }
  const rows = products
    .map((p) => {
      const image = (Array.isArray(p.images) && p.images[0]) || p.image || "";
      return `<tr>
        <td>${image ? `<img src="${escapeHtml(image)}" alt="" class="admin-thumb">` : "—"}</td>
        <td><strong>${escapeHtml(p.name)}</strong><br><small>${escapeHtml(p.condition || "")}</small></td>
        <td>${Number(p.price || 0).toLocaleString("en-US")} ${escapeHtml(p.currencySymbol || "TZS")}</td>
        <td class="admin-row-actions">
          <button class="btn btn--outline" type="button" data-edit="${escapeHtml(p.id)}">Edit</button>
          <button class="btn btn--ghost" type="button" data-delete="${escapeHtml(p.id)}">Delete</button>
        </td>
      </tr>`;
    })
    .join("");

  productTableWrap.innerHTML = `
    <div class="admin-table-scroll">
      <table class="admin-table">
        <thead>
          <tr><th>Image</th><th>Product</th><th>Price</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  productTableWrap.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edit");
      const product = currentSegmentProducts.find((x) => String(x.id) === id);
      if (product) fillForm(product, segment);
    });
  });

  productTableWrap.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-delete");
      if (!confirm("Delete this product?")) return;
      try {
        const res = await fetch("/api/admin/product", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id, segment })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Delete failed");
        setStatus("Product deleted.", true);
        await loadSegment(segment);
      } catch (err) {
        setStatus(err?.message || "Delete failed.", false);
      }
    });
  });
}

async function loadSegment(segment) {
  const res = await fetch(`/api/admin/products?segment=${encodeURIComponent(segment)}`, {
    credentials: "include",
    cache: "no-store"
  });
  if (res.status === 401) {
    window.location.replace("/admin/login.html");
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Cannot load products");
  renderTable(segment, Array.isArray(data.products) ? data.products : []);
}

async function checkSession() {
  const res = await fetch("/api/admin/me", { credentials: "include", cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!data.authed) {
    window.location.replace("/admin/login.html");
    return false;
  }
  return true;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");
  const fd = new FormData();
  fd.append("id", productIdInput.value);
  fd.append("segment", segmentInput.value);
  fd.append("name", nameInput.value);
  fd.append("description", descriptionInput.value);
  fd.append("price", priceInput.value);
  fd.append("condition", conditionInput.value);
  fd.append("currencySymbol", "TZS");
  fd.append("keepImages", JSON.stringify(selectedKeepImages));
  fd.append("removeImages", selectedKeepImages.length ? "false" : "true");

  for (const file of Array.from(imagesInput.files || [])) {
    fd.append("images", file, file.name);
  }

  try {
    const res = await fetch("/api/admin/product", {
      method: "POST",
      credentials: "include",
      body: fd
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Save failed");
    setStatus("Product saved successfully.", true);
    const seg = segmentInput.value;
    listSegmentInput.value = seg;
    resetForm();
    await loadSegment(seg);
  } catch (err) {
    setStatus(err?.message || "Save failed.", false);
  }
});

refreshBtn.addEventListener("click", async () => {
  try {
    await loadSegment(listSegmentInput.value);
    setStatus("Catalog refreshed.", true);
  } catch (err) {
    setStatus(err?.message || "Refresh failed.", false);
  }
});

listSegmentInput.addEventListener("change", () => {
  resetForm();
  segmentInput.value = listSegmentInput.value;
  loadSegment(listSegmentInput.value).catch((err) => setStatus(err?.message || "Load failed.", false));
});

resetBtn.addEventListener("click", resetForm);

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
  window.location.replace("/admin/login.html");
});

(async () => {
  if (!(await checkSession())) return;
  resetForm();
  await loadSegment(listSegmentInput.value);
})();
