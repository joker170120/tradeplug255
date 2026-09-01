# TradePlug255

TradePlug255 is an English online store for:

- Phones
- Laptops
- iPad & Tablets
- Gaming
- Accessories
- Restricted products (+18)

Theme: black and gold premium style.
WhatsApp order number: **+255 748 794 762**.

## Run locally

```bash
cd tradeplug255
npm install
npm start
```

Open: `http://localhost:3080`

## Customer accounts & orders

- Register / sign in: `http://localhost:3080/profile/`
- Passwords are hashed with bcrypt (never stored in plain text)
- When a customer orders on WhatsApp, the reservation is saved as **pending**
- The customer must click **Confirm my purchase** in their profile to move it to order history
- No integrated payment — manual confirmation only

User data, product catalogs, and uploaded images are stored on disk in the `storage/` folder (not in `public/`).

## Admin panel

- Login: `http://localhost:3080/admin/login.html`
- Dashboard: `http://localhost:3080/admin/index.html`
- Password: set `ADMIN_PASSWORD` in `.env` (default: `17012004mango`)

The admin lets you:

- Add, edit and delete products
- Upload multiple images per product
- Manage all categories: Phones, Laptops, iPad & Tablets, Gaming, Accessories, Restricted (+18)

Product seed files (initial catalog, committed in git):

- `public/data/produits-telephones.json`
- `public/data/produits-laptops.json`
- `public/data/produits-tablettes.json`
- `public/data/produits-jeux-video.json`
- `public/data/produits-accessoires.json`
- `public/data/produits-restreints.json`

At runtime, the admin saves catalogs and images to persistent storage:

- `storage/data/produits-*.json` — live product catalogs
- `storage/uploads/` — uploaded product images

## Deploy on Coolify

Coolify is the recommended host. The app is a Node.js server (`npm start`).

### 1. Create the application

- **Build pack:** Dockerfile recommended
- **Start command:** `npm start`
- **Port:** `3080` (or set `PORT` env var)
- **Health check path:** `/healthz`

### 2. Environment variables

```env
ADMIN_PASSWORD=your-secure-admin-password
PORT=3080
HOST=0.0.0.0
SITE_URL=https://your-domain.com
```

`SITE_URL` is used for `robots.txt` and `sitemap.xml`.

### 3. Persistent storage (required)

Mount **one** persistent volume on `/app/storage` so everything survives redeployments:

| Path inside volume | Purpose |
|--------------------|---------|
| `users.json` | Customer accounts |
| `orders.json` | Pending and confirmed orders |
| `user-sessions.json` | Login sessions |
| `data/produits-*.json` | Product catalogs edited in admin |
| `uploads/` | Product images uploaded in admin |

In Coolify: **Storages** → add volume → mount to `/app/storage` (adjust path if your app root differs).

Without this volume, photos and admin changes are lost on each redeploy.

If Coolify uses the included `Dockerfile`, the container declares `/app/storage` as a volume, but you still need to attach persistent storage in the Coolify dashboard.

### 4. Domains / HTTPS

Attach both domains to the same application if needed:

- `https://tradeplug255.com`
- `https://www.tradeplug255.com`
- the temporary `sslip.io` Coolify URL

If HTTPS returns `503 no available server` while HTTP works, check the Coolify proxy/domain configuration and make sure the application is running on port `3080`.

### 5. Files written at runtime

```
storage/users.json              # registered users (bcrypt hashes)
storage/orders.json             # pending + confirmed orders
storage/user-sessions.json      # login sessions
storage/data/produits-*.json    # live product catalogs
storage/uploads/                # uploaded images served at /uploads/...
```

These runtime files are gitignored. Only `.gitkeep` placeholders are committed.

## Deploy on Vercel

TradePlug255 is configured for Vercel with an Express serverless function (`api/index.js`).

### 1. Connect the GitHub repo

1. Import [github.com/joker170120/tradeplug255](https://github.com/joker170120/tradeplug255) on [vercel.com/new](https://vercel.com/new)
2. Framework preset: **Other** (Node.js)
3. Root directory: `.` (project root)
4. Build command: leave empty (static `public/` + serverless API)
5. Output directory: leave empty

### 2. Environment variables (Project → Settings → Environment Variables)

| Variable | Required | Example |
|----------|----------|---------|
| `ADMIN_PASSWORD` | Yes | your secure password |
| `SITE_URL` | Yes | `https://tradeplug255.vercel.app` or your custom domain |
| `BLOB_READ_WRITE_TOKEN` | **Yes on Vercel** | from Vercel → Storage → Blob → Connect |

Without **Vercel Blob** (or external FTP/S3), admin uploads and catalog edits **will not persist** after a redeploy.

Optional Blob (public image URLs):

```env
BLOB_PUBLIC_IMAGES=1
```

### 3. Deploy

```bash
npm install -g vercel
cd tradeplug255
vercel link
vercel --prod
```

Or push to `main` — Vercel redeploys automatically if Git integration is enabled.

### 4. Custom domain

In Vercel → Domains, add `tradeplug255.com` and set:

```env
SITE_URL=https://tradeplug255.com
```

### 5. What works on Vercel

- Storefront pages (`public/`)
- Admin panel (`/admin/`)
- Product APIs and image upload (with Blob)
- Customer accounts & orders (with Blob)
- `robots.txt` / `sitemap.xml`

### 6. Coolify vs Vercel

| | Coolify | Vercel |
|---|---------|--------|
| Persistent disk | Volume on `/app/storage` | Blob / S3 / FTP required |
| Best for | Full VPS control | Fast global CDN + HTTPS |

For production with many admin edits, **Coolify + volume** or **Vercel + Blob** both work.
