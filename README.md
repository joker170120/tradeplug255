# TradePlug255

TradePlug255 is an English online store for:

- Phones
- Laptops
- iPad & Tablets
- Gaming
- Accessories
- Restricted products (+18)

Theme: black and gold premium style.
WhatsApp order number: **+255 748 794 62**.

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

User data is stored on disk in the `storage/` folder (not in `public/`).

## Admin panel

- Login: `http://localhost:3080/admin/login.html`
- Dashboard: `http://localhost:3080/admin/index.html`
- Password: set `ADMIN_PASSWORD` in `.env` (default: `17012004mango`)

The admin lets you:

- Add, edit and delete products
- Upload multiple images per product
- Manage all categories: Phones, Laptops, iPad & Tablets, Gaming, Accessories, Restricted (+18)

Product JSON files:

- `public/data/produits-telephones.json`
- `public/data/produits-laptops.json`
- `public/data/produits-tablettes.json`
- `public/data/produits-jeux-video.json`
- `public/data/produits-accessoires.json`
- `public/data/produits-restreints.json`

Uploaded images are saved in:

- `public/uploads/`

## Deploy on Coolify

Coolify is the recommended host. The app is a Node.js server (`npm start`).

### 1. Create the application

- **Build pack:** Nixpacks or Dockerfile (Node 18+)
- **Start command:** `npm start`
- **Port:** `3080` (or set `PORT` env var)

### 2. Environment variables

```env
ADMIN_PASSWORD=your-secure-admin-password
PORT=3080
```

### 3. Persistent storage (required)

Mount a persistent volume so user accounts and orders survive restarts:

| Container path | Purpose |
|----------------|---------|
| `/app/storage` | `users.json`, `orders.json`, `user-sessions.json` |

In Coolify: **Storages** → add volume → mount to `/app/storage` (adjust path if your app root differs).

Optional: also mount `/app/public/uploads` if you want product images to persist across redeploys.

### 4. Files written at runtime

```
storage/users.json          # registered users (bcrypt hashes)
storage/orders.json         # pending + confirmed orders
storage/user-sessions.json  # login sessions
```

These files are gitignored. Only `storage/.gitkeep` is committed.

## Deploy on Vercel (optional)

Serverless mode exports the Express app. **User/order file storage will not persist** on Vercel — use Coolify for accounts and orders.

```bash
npx vercel deploy --prod
```
