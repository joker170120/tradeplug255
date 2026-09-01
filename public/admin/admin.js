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
const refreshUsersBtn = document.getElementById("refreshUsersBtn");
const usersTableWrap = document.getElementById("usersTableWrap");
const usersCountEl = document.getElementById("usersCount");
const logoutBtn = document.getElementById("logoutBtn");

const categoryForm = document.getElementById("categoryForm");
const categoryIdInput = document.getElementById("categoryId");
const categoryNameInput = document.getElementById("categoryNameInput");
const categoryEmojiInput = document.getElementById("categoryEmojiInput");
const categoryTaglineInput = document.getElementById("categoryTaglineInput");
const categoryLeadInput = document.getElementById("categoryLeadInput");
const categoryRestrictedInput = document.getElementById("categoryRestrictedInput");
const categoryStatusEl = document.getElementById("categoryStatus");
const categoryTableWrap = document.getElementById("categoryTableWrap");
const resetCategoryBtn = document.getElementById("resetCategoryBtn");

let adminCategories = [];

function setCategoryStatus(msg, ok) {
  if (!categoryStatusEl) return;
  categoryStatusEl.textContent = msg || "";
  categoryStatusEl.className = "admin-status" + (msg ? (ok ? " is-ok" : " is-err") : "");
}

function segmentLabel(key) {
  const cat = adminCategories.find((c) => c.id === key);
  return cat ? cat.name : key;
}

function populateCategorySelects(categories, selectedId) {
  const options = categories
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}"${c.id === selectedId ? " selected" : ""}>${escapeHtml(c.name)}${c.restricted ? " (+18)" : ""}</option>`
    )
    .join("");
  const html = options || '<option value="">No categories yet</option>';
  if (segmentInput) segmentInput.innerHTML = html;
  if (listSegmentInput) listSegmentInput.innerHTML = html;
  if (selectedId && listSegmentInput) listSegmentInput.value = selectedId;
  if (selectedId && segmentInput) segmentInput.value = selectedId;
}

function resetCategoryForm() {
  if (!categoryForm) return;
  categoryIdInput.value = "";
  categoryForm.reset();
  categoryRestrictedInput.value = "false";
  setCategoryStatus("");
}

function fillCategoryForm(category) {
  categoryIdInput.value = category.id;
  categoryNameInput.value = category.name || "";
  categoryEmojiInput.value = category.emoji || "📦";
  categoryTaglineInput.value = category.tagline || "";
  categoryLeadInput.value = category.lead || "";
  categoryRestrictedInput.value = category.restricted ? "true" : "false";
  setCategoryStatus(`Editing: ${category.name}`, true);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderCategoryTable(categories) {
  if (!categoryTableWrap) return;
  if (!categories.length) {
    categoryTableWrap.innerHTML = '<p class="empty-state">No categories yet. Create one above.</p>';
    return;
  }
  const rows = categories
    .map(
      (c) => `<tr>
        <td>${escapeHtml(c.emoji || "📦")}</td>
        <td><strong>${escapeHtml(c.name)}</strong><br><small>/${escapeHtml(c.id)}/</small></td>
        <td>${escapeHtml(c.tagline || "—")}</td>
        <td>${c.productCount ?? 0}</td>
        <td>${c.restricted ? "Yes" : "No"}</td>
        <td class="admin-row-actions">
          <button class="btn btn--outline" type="button" data-edit-category="${escapeHtml(c.id)}">Edit</button>
          <button class="btn btn--ghost" type="button" data-delete-category="${escapeHtml(c.id)}">Delete</button>
        </td>
      </tr>`
    )
    .join("");

  categoryTableWrap.innerHTML = `
    <div class="admin-table-scroll">
      <table class="admin-table">
        <thead>
          <tr><th></th><th>Category</th><th>Tagline</th><th>Products</th><th>+18</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  categoryTableWrap.querySelectorAll("[data-edit-category]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edit-category");
      const category = adminCategories.find((c) => c.id === id);
      if (category) fillCategoryForm(category);
    });
  });

  categoryTableWrap.querySelectorAll("[data-delete-category]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-delete-category");
      const category = adminCategories.find((c) => c.id === id);
      if (!confirm(`Delete category "${category?.name || id}"?`)) return;
      try {
        const res = await fetch("/api/admin/category", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Delete failed");
        setCategoryStatus("Category deleted.", true);
        resetCategoryForm();
        await loadCategories();
      } catch (err) {
        setCategoryStatus(err?.message || "Delete failed.", false);
      }
    });
  });
}

async function loadCategories() {
  const res = await fetch("/api/admin/categories", {
    credentials: "include",
    cache: "no-store"
  });
  if (res.status === 401) {
    window.location.replace("/admin/login.html");
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Cannot load categories");
  adminCategories = Array.isArray(data.categories) ? data.categories : [];
  renderCategoryTable(adminCategories);
  const current = listSegmentInput?.value || adminCategories[0]?.id || "";
  populateCategorySelects(adminCategories, current);
  if (current) {
    await loadSegment(current);
  } else if (productTableWrap) {
    productTableWrap.innerHTML = '<p class="empty-state">Create a category first, then add products.</p>';
  }
}

function formatAdminPrice(price, currencySymbol = "TZS") {
  if (typeof price === "number" && Number.isFinite(price)) {
    return `${Number(price).toLocaleString("en-US")} ${currencySymbol}`;
  }
  const text = String(price ?? "").trim();
  if (!text) return "—";
  const oneLine = text.split("\n")[0];
  return text.includes("\n") ? `${oneLine}…` : oneLine;
}

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
  if (/^https?:\/\//i.test(s)) return s;
  return "";
}

function resetForm() {
  productIdInput.value = "";
  form.reset();
  segmentInput.value = listSegmentInput.value;
  selectedKeepImages = [];
  renderCurrentImages();
  setStatus("");
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
  priceInput.value =
    product.price === null || product.price === undefined ? "" : String(product.price);
  conditionInput.value = product.condition || "";
  selectedKeepImages = (Array.isArray(product.images) ? product.images : [product.image])
    .map(normalizeImageUrl)
    .filter(Boolean);
  renderCurrentImages();
  setStatus(`Editing: ${product.name}`, true);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderTable(segment, products) {
  currentSegmentProducts = products;
  const category = segmentLabel(segment);
  if (!products.length) {
    productTableWrap.innerHTML = `<p class="empty-state">No products in <strong>${escapeHtml(category)}</strong> yet. Use the form above to add one.</p>`;
    return;
  }
  const rows = products
    .map((p) => {
      const image = (Array.isArray(p.images) && p.images[0]) || p.image || "";
      return `<tr>
        <td>${image ? `<img src="${escapeHtml(image)}" alt="" class="admin-thumb">` : "—"}</td>
        <td><strong>${escapeHtml(p.name)}</strong><br><small>${escapeHtml(p.condition || "")}</small></td>
        <td>${escapeHtml(category)}</td>
        <td>${escapeHtml(formatAdminPrice(p.price, p.currencySymbol || "TZS"))}</td>
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
          <tr><th>Image</th><th>Product</th><th>Category</th><th>Price</th><th>Actions</th></tr>
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
      if (!confirm("Delete this product permanently?")) return;
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
  productTableWrap.innerHTML = '<p class="empty-state">Loading products…</p>';
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

function formatUserDate(value) {
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

function renderUsersTable(users) {
  const total = users.length;
  if (usersCountEl) {
    usersCountEl.textContent = total === 1 ? "1 registered account" : `${total} registered accounts`;
  }
  if (!usersTableWrap) return;
  if (!users.length) {
    usersTableWrap.innerHTML = '<p class="empty-state">No customer accounts yet.</p>';
    return;
  }

  const rows = users
    .map(
      (user, index) => `<tr>
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(user.name)}</strong></td>
        <td><a href="mailto:${escapeHtml(user.email)}">${escapeHtml(user.email)}</a></td>
        <td>${escapeHtml(formatUserDate(user.createdAt))}</td>
        <td class="admin-row-actions">
          <button class="btn btn--ghost" type="button" data-delete-user="${escapeHtml(user.id)}">Delete</button>
        </td>
      </tr>`
    )
    .join("");

  usersTableWrap.innerHTML = `
    <div class="admin-table-scroll">
      <table class="admin-table admin-table--users">
        <thead>
          <tr><th>#</th><th>Name</th><th>Email</th><th>Registered</th><th>Actions</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  usersTableWrap.querySelectorAll("[data-delete-user]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-delete-user");
      const row = btn.closest("tr");
      const email = row?.querySelector("a")?.textContent || "this account";
      if (!confirm(`Delete account ${email}? This cannot be undone.`)) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
          method: "DELETE",
          credentials: "include"
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Delete failed");
        setStatus("Account deleted.", true);
        await loadUsers();
      } catch (err) {
        setStatus(err?.message || "Delete failed.", false);
        btn.disabled = false;
      }
    });
  });
}

async function loadUsers() {
  if (usersTableWrap) usersTableWrap.innerHTML = '<p class="empty-state">Loading accounts…</p>';
  const res = await fetch("/api/admin/users", {
    credentials: "include",
    cache: "no-store"
  });
  if (res.status === 401) {
    window.location.replace("/admin/login.html");
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Cannot load accounts");
  renderUsersTable(Array.isArray(data.users) ? data.users : []);
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
  setStatus("Saving product…");
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
    if (res.status === 401) {
      setStatus("Session expired. Redirecting to login…", false);
      window.location.replace("/admin/login.html");
      return;
    }
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

refreshUsersBtn?.addEventListener("click", async () => {
  try {
    await loadUsers();
    setStatus("Accounts list refreshed.", true);
  } catch (err) {
    setStatus(err?.message || "Could not refresh accounts.", false);
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

resetCategoryBtn?.addEventListener("click", resetCategoryForm);

categoryForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  setCategoryStatus("Saving category…");
  const payload = {
    id: categoryIdInput.value || undefined,
    name: categoryNameInput.value.trim(),
    tagline: categoryTaglineInput.value.trim(),
    lead: categoryLeadInput.value.trim(),
    emoji: categoryEmojiInput.value.trim() || "📦",
    restricted: categoryRestrictedInput.value === "true"
  };
  const isEdit = Boolean(categoryIdInput.value);
  try {
    const res = await fetch("/api/admin/category", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(isEdit ? payload : { ...payload, id: undefined })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      window.location.replace("/admin/login.html");
      return;
    }
    if (!res.ok) throw new Error(data.error || "Save failed");
    setCategoryStatus(isEdit ? "Category updated." : "Category created.", true);
    resetCategoryForm();
    await loadCategories();
  } catch (err) {
    setCategoryStatus(err?.message || "Save failed.", false);
  }
});

(async () => {
  if (!(await checkSession())) return;
  resetForm();
  resetCategoryForm();
  try {
    await loadCategories();
    await loadUsers();
  } catch (err) {
    setStatus(err?.message || "Load failed.", false);
  }
})();
