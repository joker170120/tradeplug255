require("dotenv").config();

const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const express = require("express");
const multer = require("multer");

const PORT = Number(process.env.PORT) || 3080;
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "17012004mango");
const PUBLIC = path.join(__dirname, "public");
const DATA = path.join(PUBLIC, "data");
const UPLOADS = path.join(PUBLIC, "uploads");

const SEGMENT_FILES = {
  telephones: path.join(DATA, "produits-telephones.json"),
  laptops: path.join(DATA, "produits-laptops.json"),
  "jeux-video": path.join(DATA, "produits-jeux-video.json")
};

const sessions = new Map();

function ensureDirs() {
  for (const dir of [PUBLIC, DATA, UPLOADS]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
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
    "jeux-video": listSegment("jeux-video")
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

app.use(express.static(PUBLIC, { extensions: ["html"] }));

// Vercel attend généralement un export de l'app Express (au lieu d'app.listen).
// On écoute uniquement quand on exécute `node server.js` en local.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`TradePlug255 running on http://localhost:${PORT}`);
  });
}

module.exports = app;
