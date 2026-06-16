# TradePlug255

TradePlug255 is an English online store for:

- Phones
- Laptops
- Video Games

Theme: black and gold premium style.
WhatsApp order number: **+255 748 794 62**.

## Run locally

```bash
cd tradeplug255
npm install
npm start
```

Open: `http://localhost:3080`

## Admin panel

- Login page: `http://localhost:3080/admin/login.html`
- Dashboard: `http://localhost:3080/admin/index.html`
- Admin password: set in `.env` as `ADMIN_PASSWORD` (default: `17012004mango`)

Copy `.env.example` to `.env` and change the password if needed.

The admin can:

- Add products
- Edit name, description, condition, and price
- Upload multiple product images
- Delete products

Product data is stored in:

- `public/data/produits-telephones.json`
- `public/data/produits-laptops.json`
- `public/data/produits-jeux-video.json`

Uploaded images are saved in:

- `public/uploads/`

## Deploy on Vercel

```bash
npx vercel deploy --prod
```
