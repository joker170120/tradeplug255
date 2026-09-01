require("dotenv").config();

const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { createPersistentStore } = require("./persistent-store");
const { renderProductPageHtml } = require("./product-page-render");

const PORT = Number(process.env.PORT) || 3080;
const HOST = String(process.env.HOST || "0.0.0.0");
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "17012004mango");
const SITE_URL = String(process.env.SITE_URL || "https://tradeplug255.com").replace(/\/$/, "");
const IS_VERCEL = Boolean(process.env.VERCEL || process.env.NOW_REGION);
const PUBLIC = path.join(__dirname, "public");
const PUBLIC_DATA = path.join(PUBLIC, "data");
const LEGACY_UPLOADS = path.join(PUBLIC, "uploads");
const STORAGE = path.join(__dirname, "storage");
const STORAGE_DATA = path.join(STORAGE, "data");
const STORAGE_UPLOADS = path.join(STORAGE, "uploads");
const USERS_FILE = path.join(STORAGE, "users.json");
const ORDERS_FILE = path.join(STORAGE, "orders.json");
const USER_SESSIONS_FILE = path.join(STORAGE, "user-sessions.json");
const BCRYPT_ROUNDS = 10;
const COOKIE_SECURE = process.env.COOKIE_SECURE === "1";

const persistentStore = createPersistentStore({
  publicDir: PUBLIC,
  storageDir: STORAGE,
  isVercel: IS_VERCEL
});

const CATEGORIES_FILE = path.join(STORAGE_DATA, "categories.json");
const CATEGORIES_SEED = path.join(PUBLIC_DATA, "categories.json");

const LEGACY_SEGMENT_FILENAMES = {
  telephones: "produits-telephones.json",
  laptops: "produits-laptops.json",
  tablettes: "produits-tablettes.json",
  "jeux-video": "produits-jeux-video.json",
  accessoires: "produits-accessoires.json",
  restreints: "produits-restreints.json"
};

const STATIC_PAGE_SLUGS = new Set([
  "admin",
  "api",
  "uploads",
  "produits",
  "premium",
  "contact",
  "profile",
  "catalog",
  "p",
  "images",
  "data",
  "healthz",
  "robots.txt",
  "sitemap.xml"
]);

const sessions = new Map();
const userSessions = new Map();

function ensureDirs() {
  if (persistentStore.isActive()) return;
  if (IS_VERCEL) return;
  for (const dir of [PUBLIC, PUBLIC_DATA, STORAGE, STORAGE_DATA, STORAGE_UPLOADS]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) writeJsonSync(USERS_FILE, []);
  if (!fs.existsSync(ORDERS_FILE)) writeJsonSync(ORDERS_FILE, []);
  if (!fs.existsSync(USER_SESSIONS_FILE)) writeJsonSync(USER_SESSIONS_FILE, {});
  migrateEphemeralJsonFiles();
  seedStorageCatalogs();
  migrateLegacyUploads();
}

function slugifyCategoryId(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function slugifyProductName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "product";
}

function enrichProduct(product) {
  return {
    ...product,
    slug: product.slug || slugifyProductName(product.name)
  };
}

function productPagePath(segment, product) {
  const slug = product.slug || slugifyProductName(product.name);
  return `/p/${segment}/${product.id}/${slug}`;
}

function absoluteSiteUrl(pagePath) {
  const p = String(pagePath || "").startsWith("/") ? pagePath : `/${pagePath || ""}`;
  return `${SITE_URL}${p}`;
}

async function findProductInSegment(segment, id) {
  if (!(await isValidSegment(segment))) return null;
  const list = await listSegment(segment);
  const found = list.find((p) => String(p.id) === String(id));
  return found ? enrichProduct(found) : null;
}

async function findProductById(id) {
  const categories = await readCategories();
  for (const category of categories) {
    const product = await findProductInSegment(category.id, id);
    if (product) return { segment: category.id, product };
  }
  return null;
}

async function readSiteConfig() {
  return readJson(path.join(PUBLIC_DATA, "site.json"), {});
}

function productFilenameForSegment(segment) {
  return `produits-${segment}.json`;
}

function segmentProductPath(segment) {
  return path.join(STORAGE_DATA, productFilenameForSegment(segment));
}

async function readCategories() {
  const arr = await readJson(CATEGORIES_FILE, []);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((c) => c && typeof c.id === "string" && c.id.trim())
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

async function writeCategories(categories) {
  const list = Array.isArray(categories) ? categories : [];
  await writeJson(CATEGORIES_FILE, list);
}

async function getCategory(segment) {
  const id = String(segment || "").trim();
  if (!id) return null;
  return (await readCategories()).find((c) => c.id === id) || null;
}

async function isValidSegment(segment) {
  return Boolean(await getCategory(segment));
}

function seedCategoriesFile() {
  if (fs.existsSync(CATEGORIES_FILE)) return;
  if (fs.existsSync(CATEGORIES_SEED)) {
    fs.copyFileSync(CATEGORIES_SEED, CATEGORIES_FILE);
    return;
  }
  writeJsonSync(CATEGORIES_FILE, []);
}

function seedStorageCatalogs() {
  seedCategoriesFile();

  const seedCategories = fs.existsSync(CATEGORIES_SEED)
    ? JSON.parse(fs.readFileSync(CATEGORIES_SEED, "utf8"))
    : [];
  const storageCategories = fs.existsSync(CATEGORIES_FILE)
    ? JSON.parse(fs.readFileSync(CATEGORIES_FILE, "utf8"))
    : [];

  const categoryIds = new Set([
    ...seedCategories.map((c) => c.id),
    ...storageCategories.map((c) => c.id),
    ...Object.keys(LEGACY_SEGMENT_FILENAMES)
  ]);

  for (const segment of categoryIds) {
    const filename = productFilenameForSegment(segment);
    const storageFile = path.join(STORAGE_DATA, filename);
    const seedFile = path.join(PUBLIC_DATA, filename);
    const legacyFilename = LEGACY_SEGMENT_FILENAMES[segment];
    const legacySeedFile = legacyFilename ? path.join(PUBLIC_DATA, legacyFilename) : null;

    if (!fs.existsSync(storageFile) && fs.existsSync(seedFile)) {
      fs.copyFileSync(seedFile, storageFile);
    } else if (!fs.existsSync(storageFile) && legacySeedFile && fs.existsSync(legacySeedFile)) {
      fs.copyFileSync(legacySeedFile, storageFile);
    } else if (!fs.existsSync(storageFile)) {
      writeJsonSync(storageFile, []);
    }
  }

  for (const filename of Object.values(LEGACY_SEGMENT_FILENAMES)) {
    const storageFile = path.join(STORAGE_DATA, filename);
    const legacyFile = path.join(PUBLIC_DATA, filename);
    if (!fs.existsSync(legacyFile) || !fs.existsSync(storageFile)) continue;

    const legacyMtime = fs.statSync(legacyFile).mtimeMs;
    const storageMtime = fs.statSync(storageFile).mtimeMs;
    if (legacyMtime > storageMtime) {
      fs.copyFileSync(legacyFile, storageFile);
    }
  }
}

function migrateLegacyUploads() {
  if (!fs.existsSync(LEGACY_UPLOADS)) return;

  for (const entry of fs.readdirSync(LEGACY_UPLOADS)) {
    const src = path.join(LEGACY_UPLOADS, entry);
    if (!fs.statSync(src).isFile()) continue;
    const dest = path.join(STORAGE_UPLOADS, entry);
    if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  }
}

async function loadUserSessions() {
  userSessions.clear();
  const raw = await readJson("user-sessions.json", {});
  if (!raw || typeof raw !== "object") return;
  const now = Date.now();
  for (const [token, session] of Object.entries(raw)) {
    if (session?.userId && Number(session.exp) > now) {
      userSessions.set(token, { userId: String(session.userId), exp: Number(session.exp) });
    }
  }
}

async function saveUserSessions() {
  const now = Date.now();
  const out = {};
  for (const [token, session] of userSessions.entries()) {
    if (session.exp > now) {
      out[token] = session;
    }
  }
  await writeJson("user-sessions.json", out);
}

async function readUsers() {
  const arr = await readJson("users.json", []);
  return Array.isArray(arr) ? arr : [];
}

async function writeUsers(users) {
  await writeJson("users.json", Array.isArray(users) ? users : []);
}

async function readOrders() {
  const arr = await readJson("orders.json", []);
  return Array.isArray(arr) ? arr : [];
}

async function writeOrders(orders) {
  await writeJson("orders.json", Array.isArray(orders) ? orders : []);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };
}

async function createUserSession(res, userId) {
  await loadUserSessions();
  const token = crypto.randomBytes(24).toString("hex");
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  userSessions.set(token, { userId: String(userId), exp });
  await saveUserSessions();
  const secure = COOKIE_SECURE ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `tp_user=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}${secure}`
  );
}

async function clearUserSession(res, token) {
  await loadUserSessions();
  if (token) userSessions.delete(token);
  await saveUserSessions();
  const secure = COOKIE_SECURE ? "; Secure" : "";
  res.setHeader("Set-Cookie", `tp_user=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`);
}

async function getUserId(req) {
  await loadUserSessions();
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.tp_user;
  if (!token) return null;
  const session = userSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.exp) {
    userSessions.delete(token);
    await saveUserSessions();
    return null;
  }
  return session.userId;
}

async function requireUser(req, res, next) {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ error: "Login required" });
  req.userId = userId;
  return next();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function resolveStorageJsonPath(filePathOrRel) {
  const s = String(filePathOrRel || "");
  if (path.isAbsolute(s)) return s;
  return path.join(STORAGE, s.replace(/^\/+/, ""));
}

function writeJsonSync(filePathOrRel, data) {
  const filePath = resolveStorageJsonPath(filePathOrRel);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function migrateEphemeralJsonFiles() {
  if (persistentStore.isActive()) return;
  const names = ["users.json", "orders.json", "user-sessions.json"];
  for (const name of names) {
    const ephemeral = path.join(__dirname, name);
    const persistent = path.join(STORAGE, name);
    if (!fs.existsSync(ephemeral)) continue;
    try {
      if (!fs.existsSync(persistent)) {
        fs.copyFileSync(ephemeral, persistent);
        continue;
      }
      if (name === "users.json") {
        const fromDisk = JSON.parse(fs.readFileSync(ephemeral, "utf8"));
        const onStorage = JSON.parse(fs.readFileSync(persistent, "utf8"));
        if (!Array.isArray(fromDisk) || !Array.isArray(onStorage)) continue;
        const seen = new Set(onStorage.map((u) => normalizeEmail(u.email)));
        let changed = false;
        for (const user of fromDisk) {
          const email = normalizeEmail(user?.email);
          if (!email || seen.has(email)) continue;
          onStorage.push(user);
          seen.add(email);
          changed = true;
        }
        if (changed) writeJsonSync(persistent, onStorage);
      }
    } catch {
      /* ignore broken migration source */
    }
  }
}

function normalizeProductPrice(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (/[a-zA-Z]/.test(text) || text.includes("\n")) return text;
  const num = Number(text.replace(/,/g, ""));
  if (Number.isFinite(num) && num >= 0) return num;
  return text;
}

function orderItemLineTotal(price, qty) {
  const q = Math.max(1, Number(qty || 1));
  if (typeof price === "number" && Number.isFinite(price)) return price * q;
  return null;
}

function normalizeOrderItems(items) {
  if (!Array.isArray(items) || !items.length) return null;
  const normalized = items
    .map((item) => {
      const price = normalizeProductPrice(item?.price);
      return {
        id: String(item?.id || "").trim(),
        name: String(item?.name || "").trim(),
        price: price === null ? "" : price,
        qty: Math.max(1, Number(item?.qty || 1)),
        currencySymbol: String(item?.currencySymbol || "TZS").trim() || "TZS"
      };
    })
    .filter((item) => item.id && item.name && item.price !== "" && item.price !== null);
  return normalized.length ? normalized : null;
}

async function readJson(filePathOrRel, fallback) {
  if (persistentStore.isActive()) {
    return persistentStore.readJson(storageRelativePath(filePathOrRel), fallback);
  }
  try {
    const filePath = resolveStorageJsonPath(filePathOrRel);
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(filePathOrRel, data) {
  if (persistentStore.isActive()) {
    await persistentStore.writeJson(storageRelativePath(filePathOrRel), data);
    return;
  }
  writeJsonSync(filePathOrRel, data);
}

function storageRelativePath(filePathOrRel) {
  const s = String(filePathOrRel || "");
  if (!path.isAbsolute(s)) return s.replace(/^\/+/, "");
  return path.relative(STORAGE, s).replace(/\\/g, "/");
}

function normalizeImageUrl(src) {
  if (!src || typeof src !== "string") return "";
  const s = src.trim();
  if (!s) return "";
  if (s.startsWith("/uploads/")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return "";
}

async function deleteImageUrl(src) {
  const normalized = normalizeImageUrl(src);
  if (!normalized) return;
  await persistentStore.deleteImage(normalized);
}

async function deleteRemovedUploadFiles(previous, next) {
  const nextSet = new Set((Array.isArray(next) ? next : []).map(normalizeImageUrl).filter(Boolean));
  for (const src of (Array.isArray(previous) ? previous : []).map(normalizeImageUrl).filter(Boolean)) {
    if (!nextSet.has(src)) await deleteImageUrl(src);
  }
}

async function listSegment(segment) {
  if (!(await isValidSegment(segment))) return [];
  const file = segmentProductPath(segment);
  const arr = await readJson(file, []);
  return Array.isArray(arr) ? arr : [];
}

async function saveSegment(segment, products) {
  if (!(await isValidSegment(segment))) return;
  const file = segmentProductPath(segment);
  await writeJson(file, Array.isArray(products) ? products : []);
}

async function ensureSegmentProductFile(segment) {
  const file = segmentProductPath(segment);
  if (persistentStore.isActive()) {
    const existing = await readJson(file, null);
    if (existing === null) await writeJson(file, []);
    return;
  }
  if (!fs.existsSync(file)) writeJsonSync(file, []);
}

function publicCategory(category) {
  return {
    id: category.id,
    name: category.name,
    tagline: category.tagline || "",
    lead: category.lead || "",
    emoji: category.emoji || "📦",
    restricted: Boolean(category.restricted),
    sortOrder: Number(category.sortOrder || 0)
  };
}

function parseCookies(cookieHeader) {
  const out = {};
  String(cookieHeader || "")
    .split(";")
    .forEach((part) => {
      const [k, ...rest] = part.trim().split("=");
      if (!k) return;
      out[k] = decodeURIComponent(rest.join("="));
    });
  return out;
}

function createSession(res) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + 7 * 24 * 60 * 60 * 1000);
  const secure = COOKIE_SECURE ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `tp_admin=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800${secure}`
  );
}

function clearSession(res, token) {
  if (token) sessions.delete(token);
  const secure = COOKIE_SECURE ? "; Secure" : "";
  res.setHeader("Set-Cookie", `tp_admin=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`);
}

function isAuthed(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.tp_admin;
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function requireAdmin(req, res, next) {
  if (!isAuthed(req)) return res.status(401).json({ error: "Unauthorized" });
  return next();
}

ensureDirs();

const app = express();
app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  storage: persistentStore.useMemoryUploads()
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, STORAGE_UPLOADS),
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname || "").toLowerCase();
          const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
          cb(null, `${crypto.randomUUID()}${safeExt}`);
        }
      }),
  limits: { fileSize: 8 * 1024 * 1024, files: 8 }
});

app.get("/api/admin/me", (req, res) => {
  res.json({ ok: true, authed: isAuthed(req) });
});

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body?.password || "");
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Invalid password" });
  createSession(res);
  return res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  clearSession(res, cookies.tp_admin);
  return res.json({ ok: true });
});

app.get("/api/categories", async (_req, res) => {
  const categories = (await readCategories()).map(publicCategory);
  return res.json({ categories });
});

app.get("/api/admin/categories", requireAdmin, async (_req, res) => {
  const categories = await readCategories();
  const withCounts = await Promise.all(
    categories.map(async (category) => ({
      ...publicCategory(category),
      productCount: (await listSegment(category.id)).length
    }))
  );
  return res.json({ categories: withCounts });
});

app.post("/api/admin/category", requireAdmin, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const tagline = String(req.body?.tagline || "").trim();
  const lead = String(req.body?.lead || "").trim();
  const emoji = String(req.body?.emoji || "📦").trim() || "📦";
  const restricted = Boolean(req.body?.restricted);
  const requestedId = String(req.body?.id || "").trim();

  if (!name) return res.status(400).json({ error: "Category name is required" });

  const categories = await readCategories();
  let id = requestedId ? slugifyCategoryId(requestedId) : slugifyCategoryId(name);
  if (!id) return res.status(400).json({ error: "Invalid category id" });
  if (STATIC_PAGE_SLUGS.has(id)) {
    return res.status(400).json({ error: "This category id is reserved" });
  }
  if (categories.some((c) => c.id === id)) {
    if (requestedId) return res.status(409).json({ error: "Category id already exists" });
    let suffix = 2;
    while (categories.some((c) => c.id === `${id}-${suffix}`)) suffix += 1;
    id = `${id}-${suffix}`;
  }

  const category = {
    id,
    name,
    tagline,
    lead: lead || `Browse our ${name} selection.`,
    emoji,
    restricted,
    sortOrder: categories.length,
    createdAt: new Date().toISOString()
  };

  categories.push(category);
  await writeCategories(categories);
  await ensureSegmentProductFile(id);

  return res.json({ ok: true, category: publicCategory(category) });
});

app.put("/api/admin/category", requireAdmin, async (req, res) => {
  const id = String(req.body?.id || "").trim();
  const name = String(req.body?.name || "").trim();
  const tagline = String(req.body?.tagline || "").trim();
  const lead = String(req.body?.lead || "").trim();
  const emoji = String(req.body?.emoji || "📦").trim() || "📦";
  const restricted = Boolean(req.body?.restricted);

  if (!id) return res.status(400).json({ error: "Category id is required" });
  if (!name) return res.status(400).json({ error: "Category name is required" });

  const categories = await readCategories();
  const index = categories.findIndex((c) => c.id === id);
  if (index < 0) return res.status(404).json({ error: "Category not found" });

  categories[index] = {
    ...categories[index],
    name,
    tagline,
    lead,
    emoji,
    restricted,
    updatedAt: new Date().toISOString()
  };
  await writeCategories(categories);
  return res.json({ ok: true, category: publicCategory(categories[index]) });
});

app.delete("/api/admin/category", requireAdmin, async (req, res) => {
  const id = String(req.body?.id || "").trim();
  if (!id) return res.status(400).json({ error: "Category id is required" });

  const categories = await readCategories();
  const index = categories.findIndex((c) => c.id === id);
  if (index < 0) return res.status(404).json({ error: "Category not found" });

  const products = await listSegment(id);
  if (products.length) {
    return res.status(400).json({
      error: `Cannot delete: ${products.length} product(s) still in this category. Move or delete them first.`
    });
  }

  categories.splice(index, 1);
  await writeCategories(categories);

  const productFile = segmentProductPath(id);
  if (persistentStore.isActive()) {
    await writeJson(productFile, []);
  } else if (fs.existsSync(productFile)) {
    fs.unlinkSync(productFile);
  }

  return res.json({ ok: true });
});

app.get("/api/products/:segment", async (req, res) => {
  const segment = String(req.params.segment || "");
  if (!(await isValidSegment(segment))) return res.status(404).json({ error: "Category not found" });
  const products = (await listSegment(segment)).map(enrichProduct);
  return res.json({ products });
});

app.get("/api/product/:segment/:id", async (req, res) => {
  const segment = String(req.params.segment || "");
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing product id" });
  const product = await findProductInSegment(segment, id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  return res.json({ segment, product });
});

app.get("/api/admin/products", requireAdmin, async (req, res) => {
  const segment = String(req.query.segment || "");
  if (segment) {
    if (!(await isValidSegment(segment))) return res.status(404).json({ error: "Category not found" });
    return res.json({ segment, products: await listSegment(segment) });
  }
  const categories = await readCategories();
  const out = {};
  for (const category of categories) {
    out[category.id] = await listSegment(category.id);
  }
  return res.json(out);
});

app.get("/api/admin/users", requireAdmin, async (_req, res) => {
  const users = (await readUsers())
    .map(publicUser)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return res.json({ ok: true, users, total: users.length });
});

app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "Missing user id" });

  const users = await readUsers();
  const index = users.findIndex((u) => String(u.id) === id);
  if (index < 0) return res.status(404).json({ error: "User not found" });

  users.splice(index, 1);
  await writeUsers(users);

  const orders = await readOrders();
  const nextOrders = orders.filter((o) => String(o.userId) !== id);
  if (nextOrders.length !== orders.length) await writeOrders(nextOrders);

  await loadUserSessions();
  for (const [token, session] of userSessions.entries()) {
    if (String(session.userId) === id) userSessions.delete(token);
  }
  await saveUserSessions();

  return res.json({ ok: true });
});

app.post("/api/admin/product", requireAdmin, upload.array("images", 8), async (req, res) => {
  const segment = String(req.body?.segment || "");
  if (!(await isValidSegment(segment))) return res.status(400).json({ error: "Invalid category" });

  const id = String(req.body?.id || "").trim();
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  const condition = String(req.body?.condition || "").trim();
  const price = normalizeProductPrice(req.body?.price);
  const currencySymbol = String(req.body?.currencySymbol || "TZS").trim() || "TZS";
  if (!name || price === null) {
    return res.status(400).json({ error: "Invalid product fields" });
  }

  const keepImagesRaw = req.body?.keepImages;
  let keepImages = null;
  if (keepImagesRaw) {
    try {
      const parsed = JSON.parse(String(keepImagesRaw));
      if (Array.isArray(parsed)) keepImages = parsed.map(normalizeImageUrl).filter(Boolean);
    } catch {
      keepImages = null;
    }
  }

  const files = Array.isArray(req.files) ? req.files : [];
  const uploaded = [];
  for (const f of files) {
    if (persistentStore.useMemoryUploads()) {
      const ext = path.extname(f.originalname || "").toLowerCase();
      uploaded.push(await persistentStore.uploadImage(f, ext));
    } else {
      uploaded.push(`/uploads/${path.basename(f.filename)}`);
    }
  }

  const list = await listSegment(segment);
  const existingIndex = id ? list.findIndex((p) => String(p.id) === id) : -1;
  const existing = existingIndex >= 0 ? list[existingIndex] : null;
  const prevImages = Array.isArray(existing?.images)
    ? existing.images.map(normalizeImageUrl).filter(Boolean)
    : normalizeImageUrl(existing?.image)
      ? [normalizeImageUrl(existing.image)]
      : [];

  const removeImages = String(req.body?.removeImages || "").toLowerCase() === "true";
  const baseImages = removeImages ? [] : keepImages || prevImages;
  const images = [...baseImages, ...uploaded].filter(Boolean);
  await deleteRemovedUploadFiles(prevImages, images);

  const product = {
    id: existing?.id || crypto.randomUUID(),
    name,
    description,
    price,
    currencySymbol,
    condition,
    images,
    image: images[0] || "",
    slug: slugifyProductName(name)
  };

  if (existingIndex >= 0) list[existingIndex] = { ...existing, ...product };
  else list.unshift(product);
  await saveSegment(segment, list);

  return res.json({ ok: true, segment, product });
});

app.delete("/api/admin/product", requireAdmin, async (req, res) => {
  const segment = String(req.body?.segment || "");
  const id = String(req.body?.id || "");
  if (!(await isValidSegment(segment)) || !id) return res.status(400).json({ error: "Missing category or id" });
  const list = await listSegment(segment);
  const removed = list.find((p) => String(p.id) === id);
  const next = list.filter((p) => String(p.id) !== id);
  await saveSegment(segment, next);
  if (removed) {
    const images = Array.isArray(removed.images) ? removed.images : removed.image ? [removed.image] : [];
    await deleteRemovedUploadFiles(images, []);
  }
  return res.json({ ok: true });
});

// --- User accounts (passwords hashed with bcrypt) ---
app.post("/api/auth/register", async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email and password are required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  const users = await readUsers();
  if (users.some((u) => normalizeEmail(u.email) === email)) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  await writeUsers(users);
  await createUserSession(res, user.id);
  return res.json({ ok: true, user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = (await readUsers()).find((u) => normalizeEmail(u.email) === email);
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const valid = await bcrypt.compare(password, String(user.passwordHash || ""));
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  await createUserSession(res, user.id);
  return res.json({ ok: true, user: publicUser(user) });
});

app.post("/api/auth/logout", async (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  await clearUserSession(res, cookies.tp_user);
  return res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) return res.json({ ok: true, authed: false, user: null });
  const user = (await readUsers()).find((u) => String(u.id) === String(userId));
  if (!user) return res.json({ ok: true, authed: false, user: null });
  return res.json({ ok: true, authed: true, user: publicUser(user) });
});

// --- Orders: pending until user confirms purchase manually ---
app.post("/api/orders", requireUser, async (req, res) => {
  const items = normalizeOrderItems(req.body?.items);
  if (!items) return res.status(400).json({ error: "Invalid order items" });

  const orderInfo = {
    name: String(req.body?.orderInfo?.name || "").trim(),
    phone: String(req.body?.orderInfo?.phone || "").trim(),
    city: String(req.body?.orderInfo?.city || "").trim(),
    address: String(req.body?.orderInfo?.address || "").trim(),
    notes: String(req.body?.orderInfo?.notes || "").trim()
  };
  const segment = String(req.body?.segment || "").trim();
  const total = items.reduce((sum, item) => {
    const line = orderItemLineTotal(item.price, item.qty);
    return sum + (line ?? 0);
  }, 0);
  const currencySymbol = items[0]?.currencySymbol || "TZS";

  const order = {
    id: crypto.randomUUID(),
    userId: req.userId,
    status: "pending",
    items,
    orderInfo,
    segment: (await isValidSegment(segment)) ? segment : "",
    total,
    currencySymbol,
    createdAt: new Date().toISOString(),
    confirmedAt: null
  };

  const orders = await readOrders();
  orders.unshift(order);
  await writeOrders(orders);
  return res.json({ ok: true, order });
});

app.get("/api/orders/pending", requireUser, async (req, res) => {
  const pending = (await readOrders()).filter(
    (o) => String(o.userId) === String(req.userId) && o.status === "pending"
  );
  return res.json({ ok: true, orders: pending });
});

app.get("/api/orders/history", requireUser, async (req, res) => {
  const history = (await readOrders()).filter(
    (o) => String(o.userId) === String(req.userId) && o.status === "confirmed"
  );
  return res.json({ ok: true, orders: history });
});

app.post("/api/orders/:id/confirm", requireUser, async (req, res) => {
  const orderId = String(req.params.id || "");
  const orders = await readOrders();
  const index = orders.findIndex(
    (o) => String(o.id) === orderId && String(o.userId) === String(req.userId)
  );
  if (index < 0) return res.status(404).json({ error: "Order not found" });
  if (orders[index].status !== "pending") {
    return res.status(400).json({ error: "Order is not pending" });
  }

  orders[index] = {
    ...orders[index],
    status: "confirmed",
    confirmedAt: new Date().toISOString()
  };
  await writeOrders(orders);
  return res.json({ ok: true, order: orders[index] });
});

app.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`
  );
});

app.get("/sitemap.xml", async (_req, res) => {
  const lastmod = new Date().toISOString().slice(0, 10);
  const basePaths = [
    { path: "/", priority: "1.0", changefreq: "weekly" },
    { path: "/produits/", priority: "0.9", changefreq: "weekly" },
    { path: "/premium/", priority: "0.7", changefreq: "monthly" },
    { path: "/contact/", priority: "0.7", changefreq: "monthly" },
    { path: "/profile/", priority: "0.6", changefreq: "monthly" }
  ];
  const categoryPaths = (await readCategories()).map((c) => ({
    path: `/${c.id}/`,
    priority: "0.8",
    changefreq: "weekly"
  }));

  const productPaths = [];
  const categories = await readCategories();
  for (const category of categories) {
    const list = await listSegment(category.id);
    for (const raw of list) {
      const product = enrichProduct(raw);
      productPaths.push({
        path: productPagePath(category.id, product),
        priority: "0.7",
        changefreq: "weekly"
      });
    }
  }

  const urls = [...basePaths, ...categoryPaths, ...productPaths]
    .map(({ path: pagePath, priority, changefreq }) => {
      const loc = pagePath === "/" ? `${SITE_URL}/` : `${SITE_URL}${pagePath}`;
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  res.type("application/xml").send(xml);
});

app.get("/p/:segment/:id/:slug", async (req, res) => {
  const segment = String(req.params.segment || "").toLowerCase();
  const id = String(req.params.id || "").trim();
  const slugParam = String(req.params.slug || "").trim();

  if (!(await isValidSegment(segment))) return res.status(404).send("Category not found");
  const product = await findProductInSegment(segment, id);
  if (!product) return res.status(404).send("Product not found");

  const canonicalSlug = product.slug || slugifyProductName(product.name);
  const canonicalPath = productPagePath(segment, product);
  if (slugParam !== canonicalSlug) {
    return res.redirect(301, canonicalPath);
  }

  const categories = await readCategories();
  const category = categories.find((c) => c.id === segment) || { id: segment, name: segment };
  const site = await readSiteConfig();
  const canonical = absoluteSiteUrl(canonicalPath);
  res.type("html").send(renderProductPageHtml(product, segment, category, site, canonical));
});

app.get("/p/:segment/:id", async (req, res) => {
  const segment = String(req.params.segment || "").toLowerCase();
  const id = String(req.params.id || "").trim();

  if (!(await isValidSegment(segment))) return res.status(404).send("Category not found");
  const product = await findProductInSegment(segment, id);
  if (!product) return res.status(404).send("Product not found");

  return res.redirect(301, productPagePath(segment, product));
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.use("/uploads", express.static(STORAGE_UPLOADS, { fallthrough: false, maxAge: "7d" }));

app.get("/:segment/", async (req, res, next) => {
  const slug = String(req.params.segment || "").toLowerCase();
  if (!slug || STATIC_PAGE_SLUGS.has(slug)) return next();
  if (!(await isValidSegment(slug))) return next();
  const staticFile = path.join(PUBLIC, slug, "index.html");
  if (fs.existsSync(staticFile)) return next();
  return res.sendFile(path.join(PUBLIC, "catalog", "index.html"));
});

app.use(express.static(PUBLIC, { extensions: ["html"] }));

// Vercel attend généralement un export de l'app Express (au lieu d'app.listen).
// On écoute uniquement quand on exécute `node server.js` en local.
if (require.main === module) {
  loadUserSessions()
    .then(() => {
      app.listen(PORT, HOST, () => {
        console.log(`TradePlug255 running on http://${HOST}:${PORT}`);
      });
    })
    .catch((err) => {
      console.error("Failed to start TradePlug255:", err);
      process.exit(1);
    });
}

module.exports = app;
