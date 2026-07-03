require("dotenv").config();

const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { createPersistentStore } = require("./persistent-store");

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

const persistentStore = createPersistentStore({
  publicDir: PUBLIC,
  storageDir: STORAGE,
  isVercel: IS_VERCEL
});

const SEGMENT_FILENAMES = {
  telephones: "produits-telephones.json",
  laptops: "produits-laptops.json",
  tablettes: "produits-tablettes.json",
  "jeux-video": "produits-jeux-video.json",
  accessoires: "produits-accessoires.json",
  restreints: "produits-restreints.json"
};

const SEGMENT_FILES = Object.fromEntries(
  Object.entries(SEGMENT_FILENAMES).map(([segment, filename]) => [
    segment,
    path.join(STORAGE_DATA, filename)
  ])
);

const SITEMAP_PATHS = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/produits/", priority: "0.9", changefreq: "weekly" },
  { path: "/telephones/", priority: "0.8", changefreq: "weekly" },
  { path: "/laptops/", priority: "0.8", changefreq: "weekly" },
  { path: "/tablettes/", priority: "0.8", changefreq: "weekly" },
  { path: "/accessoires/", priority: "0.8", changefreq: "weekly" },
  { path: "/jeux-video/", priority: "0.8", changefreq: "weekly" },
  { path: "/premium/", priority: "0.7", changefreq: "monthly" },
  { path: "/contact/", priority: "0.7", changefreq: "monthly" },
  { path: "/profile/", priority: "0.5", changefreq: "monthly" }
];

const sessions = new Map();
const userSessions = new Map();

function ensureDirs() {
  if (persistentStore.isActive()) return;
  if (IS_VERCEL) return;
  for (const dir of [PUBLIC, PUBLIC_DATA, STORAGE, STORAGE_DATA, STORAGE_UPLOADS]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) writeJson(USERS_FILE, []);
  if (!fs.existsSync(ORDERS_FILE)) writeJson(ORDERS_FILE, []);
  if (!fs.existsSync(USER_SESSIONS_FILE)) writeJson(USER_SESSIONS_FILE, {});
  seedStorageCatalogs();
  migrateLegacyUploads();
  loadUserSessions();
}

function seedStorageCatalogs() {
  for (const filename of Object.values(SEGMENT_FILENAMES)) {
    const storageFile = path.join(STORAGE_DATA, filename);
    const seedFile = path.join(PUBLIC_DATA, filename);

    if (!fs.existsSync(storageFile) && fs.existsSync(seedFile)) {
      fs.copyFileSync(seedFile, storageFile);
    } else if (!fs.existsSync(storageFile)) {
      writeJson(storageFile, []);
    }
  }

  // One-time migration if catalogs were previously saved in public/data on the server.
  for (const filename of Object.values(SEGMENT_FILENAMES)) {
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
  res.setHeader(
    "Set-Cookie",
    `tp_user=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
  );
}

async function clearUserSession(res, token) {
  await loadUserSessions();
  if (token) userSessions.delete(token);
  await saveUserSessions();
  res.setHeader("Set-Cookie", "tp_user=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
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

function normalizeOrderItems(items) {
  if (!Array.isArray(items) || !items.length) return null;
  const normalized = items
    .map((item) => ({
      id: String(item?.id || "").trim(),
      name: String(item?.name || "").trim(),
      price: Number(item?.price || 0),
      qty: Math.max(1, Number(item?.qty || 1)),
      currencySymbol: String(item?.currencySymbol || "TZS").trim() || "TZS"
    }))
    .filter((item) => item.id && item.name && Number.isFinite(item.price) && item.price >= 0);
  return normalized.length ? normalized : null;
}

async function readJson(filePathOrRel, fallback) {
  if (persistentStore.isActive()) {
    return persistentStore.readJson(storageRelativePath(filePathOrRel), fallback);
  }
  try {
    const raw = fs.readFileSync(filePathOrRel, "utf8");
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
  fs.writeFileSync(filePathOrRel, `${JSON.stringify(data, null, 2)}\n`, "utf8");
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
  const file = SEGMENT_FILES[segment];
  if (!file) return [];
  const arr = await readJson(file, []);
  return Array.isArray(arr) ? arr : [];
}

async function saveSegment(segment, products) {
  const file = SEGMENT_FILES[segment];
  if (!file) return;
  await writeJson(file, Array.isArray(products) ? products : []);
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
  res.setHeader(
    "Set-Cookie",
    `tp_admin=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`
  );
}

function clearSession(res, token) {
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", "tp_admin=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
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

app.get("/api/products/:segment", async (req, res) => {
  const segment = String(req.params.segment || "");
  if (!SEGMENT_FILES[segment]) return res.status(404).json({ error: "Segment not found" });
  return res.json({ products: await listSegment(segment) });
});

app.get("/api/admin/products", requireAdmin, async (req, res) => {
  const segment = String(req.query.segment || "");
  if (segment) {
    if (!SEGMENT_FILES[segment]) return res.status(404).json({ error: "Segment not found" });
    return res.json({ segment, products: await listSegment(segment) });
  }
  return res.json({
    telephones: await listSegment("telephones"),
    laptops: await listSegment("laptops"),
    tablettes: await listSegment("tablettes"),
    "jeux-video": await listSegment("jeux-video"),
    accessoires: await listSegment("accessoires"),
    restreints: await listSegment("restreints")
  });
});

app.post("/api/admin/product", requireAdmin, upload.array("images", 8), async (req, res) => {
  const segment = String(req.body?.segment || "");
  if (!SEGMENT_FILES[segment]) return res.status(400).json({ error: "Invalid segment" });

  const id = String(req.body?.id || "").trim();
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  const condition = String(req.body?.condition || "").trim();
  const price = Number(req.body?.price || 0);
  const currencySymbol = String(req.body?.currencySymbol || "TZS").trim() || "TZS";
  if (!name || !Number.isFinite(price) || price < 0) {
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
    image: images[0] || ""
  };

  if (existingIndex >= 0) list[existingIndex] = { ...existing, ...product };
  else list.unshift(product);
  await saveSegment(segment, list);

  return res.json({ ok: true, segment, product });
});

app.delete("/api/admin/product", requireAdmin, async (req, res) => {
  const segment = String(req.body?.segment || "");
  const id = String(req.body?.id || "");
  if (!SEGMENT_FILES[segment] || !id) return res.status(400).json({ error: "Missing segment or id" });
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
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const currencySymbol = items[0]?.currencySymbol || "TZS";

  const order = {
    id: crypto.randomUUID(),
    userId: req.userId,
    status: "pending",
    items,
    orderInfo,
    segment: SEGMENT_FILES[segment] ? segment : "",
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

app.get("/sitemap.xml", (_req, res) => {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = SITEMAP_PATHS.map(({ path: pagePath, priority, changefreq }) => {
    const loc = pagePath === "/" ? `${SITE_URL}/` : `${SITE_URL}${pagePath}`;
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  res.type("application/xml").send(xml);
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.use("/uploads", express.static(STORAGE_UPLOADS, { fallthrough: false, maxAge: "7d" }));

app.use(express.static(PUBLIC, { extensions: ["html"] }));

// Vercel attend généralement un export de l'app Express (au lieu d'app.listen).
// On écoute uniquement quand on exécute `node server.js` en local.
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`TradePlug255 running on http://${HOST}:${PORT}`);
  });
}

module.exports = app;
