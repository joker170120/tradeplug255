require("dotenv").config();

const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");

const PORT = Number(process.env.PORT) || 3080;
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "17012004mango");
const PUBLIC = path.join(__dirname, "public");
const DATA = path.join(PUBLIC, "data");
const UPLOADS = path.join(PUBLIC, "uploads");
const STORAGE = path.join(__dirname, "storage");
const USERS_FILE = path.join(STORAGE, "users.json");
const ORDERS_FILE = path.join(STORAGE, "orders.json");
const USER_SESSIONS_FILE = path.join(STORAGE, "user-sessions.json");
const BCRYPT_ROUNDS = 10;

const SEGMENT_FILES = {
  telephones: path.join(DATA, "produits-telephones.json"),
  laptops: path.join(DATA, "produits-laptops.json"),
  tablettes: path.join(DATA, "produits-tablettes.json"),
  "jeux-video": path.join(DATA, "produits-jeux-video.json"),
  accessoires: path.join(DATA, "produits-accessoires.json"),
  restreints: path.join(DATA, "produits-restreints.json")
};

const sessions = new Map();
const userSessions = new Map();

function ensureDirs() {
  for (const dir of [PUBLIC, DATA, UPLOADS, STORAGE]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) writeJson(USERS_FILE, []);
  if (!fs.existsSync(ORDERS_FILE)) writeJson(ORDERS_FILE, []);
  if (!fs.existsSync(USER_SESSIONS_FILE)) writeJson(USER_SESSIONS_FILE, {});
  loadUserSessions();
}

function loadUserSessions() {
  userSessions.clear();
  const raw = readJson(USER_SESSIONS_FILE, {});
  if (!raw || typeof raw !== "object") return;
  const now = Date.now();
  for (const [token, session] of Object.entries(raw)) {
    if (session?.userId && Number(session.exp) > now) {
      userSessions.set(token, { userId: String(session.userId), exp: Number(session.exp) });
    }
  }
}

function saveUserSessions() {
  const now = Date.now();
  const out = {};
  for (const [token, session] of userSessions.entries()) {
    if (session.exp > now) {
      out[token] = session;
    }
  }
  writeJson(USER_SESSIONS_FILE, out);
}

function readUsers() {
  const arr = readJson(USERS_FILE, []);
  return Array.isArray(arr) ? arr : [];
}

function writeUsers(users) {
  writeJson(USERS_FILE, Array.isArray(users) ? users : []);
}

function readOrders() {
  const arr = readJson(ORDERS_FILE, []);
  return Array.isArray(arr) ? arr : [];
}

function writeOrders(orders) {
  writeJson(ORDERS_FILE, Array.isArray(orders) ? orders : []);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  };
}

function createUserSession(res, userId) {
  const token = crypto.randomBytes(24).toString("hex");
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  userSessions.set(token, { userId: String(userId), exp });
  saveUserSessions();
  res.setHeader(
    "Set-Cookie",
    `tp_user=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}`
  );
}

function clearUserSession(res, token) {
  if (token) userSessions.delete(token);
  saveUserSessions();
  res.setHeader("Set-Cookie", "tp_user=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
}

function getUserId(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies.tp_user;
  if (!token) return null;
  const session = userSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.exp) {
    userSessions.delete(token);
    saveUserSessions();
    return null;
  }
  return session.userId;
}

function requireUser(req, res, next) {
  const userId = getUserId(req);
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

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeImageUrl(src) {
  if (!src || typeof src !== "string") return "";
  const s = src.trim();
  if (!s) return "";
  if (s.startsWith("/uploads/")) return s;
  if (/^https?:\/\//i.test(s) && /blob\.vercel-storage\.com/i.test(s)) return s;
  return "";
}

function listSegment(segment) {
  const file = SEGMENT_FILES[segment];
  if (!file) return [];
  const arr = readJson(file, []);
  return Array.isArray(arr) ? arr : [];
}

function saveSegment(segment, products) {
  const file = SEGMENT_FILES[segment];
  if (!file) return;
  writeJson(file, Array.isArray(products) ? products : []);
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
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS),
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

app.get("/api/products/:segment", (req, res) => {
  const segment = String(req.params.segment || "");
  if (!SEGMENT_FILES[segment]) return res.status(404).json({ error: "Segment not found" });
  return res.json({ products: listSegment(segment) });
});

app.get("/api/admin/products", requireAdmin, (req, res) => {
  const segment = String(req.query.segment || "");
  if (segment) {
    if (!SEGMENT_FILES[segment]) return res.status(404).json({ error: "Segment not found" });
    return res.json({ segment, products: listSegment(segment) });
  }
  return res.json({
    telephones: listSegment("telephones"),
    laptops: listSegment("laptops"),
    tablettes: listSegment("tablettes"),
    "jeux-video": listSegment("jeux-video"),
    accessoires: listSegment("accessoires"),
    restreints: listSegment("restreints")
  });
});

app.post("/api/admin/product", requireAdmin, upload.array("images", 8), (req, res) => {
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
  const uploaded = files.map((f) => `/uploads/${path.basename(f.filename)}`);

  const list = listSegment(segment);
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
  saveSegment(segment, list);

  return res.json({ ok: true, segment, product });
});

app.delete("/api/admin/product", requireAdmin, (req, res) => {
  const segment = String(req.body?.segment || "");
  const id = String(req.body?.id || "");
  if (!SEGMENT_FILES[segment] || !id) return res.status(400).json({ error: "Missing segment or id" });
  const list = listSegment(segment);
  const next = list.filter((p) => String(p.id) !== id);
  saveSegment(segment, next);
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

  const users = readUsers();
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
  writeUsers(users);
  createUserSession(res, user.id);
  return res.json({ ok: true, user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = readUsers().find((u) => normalizeEmail(u.email) === email);
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const valid = await bcrypt.compare(password, String(user.passwordHash || ""));
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  createUserSession(res, user.id);
  return res.json({ ok: true, user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  const cookies = parseCookies(req.headers.cookie || "");
  clearUserSession(res, cookies.tp_user);
  return res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.json({ ok: true, authed: false, user: null });
  const user = readUsers().find((u) => String(u.id) === String(userId));
  if (!user) return res.json({ ok: true, authed: false, user: null });
  return res.json({ ok: true, authed: true, user: publicUser(user) });
});

// --- Orders: pending until user confirms purchase manually ---
app.post("/api/orders", requireUser, (req, res) => {
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

  const orders = readOrders();
  orders.unshift(order);
  writeOrders(orders);
  return res.json({ ok: true, order });
});

app.get("/api/orders/pending", requireUser, (req, res) => {
  const pending = readOrders().filter(
    (o) => String(o.userId) === String(req.userId) && o.status === "pending"
  );
  return res.json({ ok: true, orders: pending });
});

app.get("/api/orders/history", requireUser, (req, res) => {
  const history = readOrders().filter(
    (o) => String(o.userId) === String(req.userId) && o.status === "confirmed"
  );
  return res.json({ ok: true, orders: history });
});

app.post("/api/orders/:id/confirm", requireUser, (req, res) => {
  const orderId = String(req.params.id || "");
  const orders = readOrders();
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
  writeOrders(orders);
  return res.json({ ok: true, order: orders[index] });
});

app.use(express.static(PUBLIC, { extensions: ["html"] }));

// Vercel attend généralement un export de l'app Express (au lieu d'app.listen).
// On écoute uniquement quand on exécute `node server.js` en local.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`TradePlug255 running on http://localhost:${PORT}`);
  });
}

module.exports = app;
