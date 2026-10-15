# QuickCart — Backend API

Node.js + Express + MongoDB (Mongoose) + Razorpay REST API for the QuickCart mini e-commerce app.
Written in JavaScript **ES modules**.

This is a standalone application — it has no dependency on the frontend repository and is meant to live in its own Git repository.

---

## Table of contents
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment setup](#environment-setup)
- [Database setup](#database-setup)
- [Seed instructions](#seed-instructions)
- [Development commands](#development-commands)
- [Production build / run](#production-build--run)
- [API documentation](#api-documentation)
- [Money & currency](#money--currency)
- [Payment flow & security](#payment-flow--security)
- [Razorpay test-mode setup](#razorpay-test-mode-setup)
- [Troubleshooting](#troubleshooting)
- [Testing checklist](#testing-checklist)
- [Deployment](#deployment)

---

## Prerequisites
- **Node.js ≥ 18** (developed on Node 24)
- **MongoDB** — either a local server or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster
- A **Razorpay** account in **Test mode** (for the payment endpoints)

## Installation
```powershell
cd quickcart-backend
npm install
```

## Environment setup
Copy the example file and fill in the values:
```powershell
Copy-Item .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `PORT` | no (default 5000) | Port the API listens on |
| `MONGODB_URI` | **yes** | Mongo connection string (local or Atlas) |
| `FRONTEND_URL` | no (default `http://localhost:3000`) | Allowed CORS origin |
| `RAZORPAY_KEY_ID` | for payments | Razorpay **test** key id (public) |
| `RAZORPAY_KEY_SECRET` | for payments | Razorpay **test** key secret (server-only) |
| `JWT_SECRET` | **for auth** | Secret used to sign session JWTs — long random string |
| `JWT_EXPIRES_IN` | no (default `7d`) | Session lifetime |
| `AUTH_COOKIE_NAME` | no (default `qc_token`) | HttpOnly session cookie name |
| `CSRF_COOKIE_NAME` | no (default `qc_csrf`) | Readable CSRF cookie name |
| `COOKIE_SECURE` | no | `true`/`false`; auto-on in production. Set `false` for local HTTP |
| `NODE_ENV` | no | `development` / `production` |

> Generate a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

> **Never commit `.env`.** Only `.env.example` is tracked. The Razorpay **secret** is used only on the server and is never sent to the browser.

## Database setup
- **Local MongoDB:** install MongoDB Community Server, then use
  `MONGODB_URI=mongodb://127.0.0.1:27017/quickcart`
- **Atlas:** create a free cluster, add a database user, allow your IP, and copy the `mongodb+srv://…/quickcart` string into `MONGODB_URI`.

No manual collection creation is needed — Mongoose creates collections/indexes on first use.

## Seed instructions
Inserts 8 sample products (clears the `products` collection first):
```powershell
npm run seed
```
Expected output ends with `[seed] done ✅` and a list of 8 products.

## Development commands
```powershell
npm run dev     # start with node --watch (auto-reload, no extra deps)
npm start       # start once with node
npm run seed    # (re)seed products
npm run check   # static load check — parses/evaluates every module without DB or server
```

## Production build / run
There is no build step (plain Node ES modules). For production:
```powershell
$env:NODE_ENV = "production"
npm start
```
Run behind a process manager (e.g. `pm2`) or your host's runtime.

---

## API documentation

Base URL: `http://localhost:5000/api`

**Response envelope**
- Success: `{ "success": true, "data": { ... } }`
- Error: `{ "success": false, "error": { "message": "...", "details"?: [...] } }`

### `GET /api/health`
Liveness + status.
```json
{ "success": true, "data": { "status": "ok", "uptime": 12.3, "timestamp": "…", "db": "connected", "razorpayConfigured": true } }
```

### Authentication

Cookie-based sessions. On register/login the server sets an **HttpOnly, SameSite=Lax** JWT cookie
(`qc_token`) plus a readable CSRF cookie (`qc_csrf`). State-changing requests must echo the CSRF
cookie in an `x-csrf-token` header (double-submit). The browser sends cookies automatically when the
frontend uses `withCredentials`. CORS is credentialed and locked to `FRONTEND_URL`.

| Method | Path | Auth | Body |
|---|---|---|---|
| POST | `/api/auth/register` | public | `{ name, email, password }` |
| POST | `/api/auth/login` | public | `{ email, password }` |
| POST | `/api/auth/logout` | cookie + CSRF | — |
| GET | `/api/auth/me` | cookie | — |

- Passwords hashed with **bcrypt** (cost 12); the hash is never returned.
- Register rejects duplicate email with `409`. Login uses a generic `401` ("Invalid email or password") so it does not reveal whether an email exists.
- Password policy: ≥ 8 chars incl. a letter and a number.
- **Protected (require login + CSRF):** `POST /api/payments/create-order`, `/verify`, `/failed`.
- **Owner-scoped (require login):** `GET /api/orders`, `GET /api/orders/:id` — a user only sees their own orders; others return `404`.

> **Not implemented:** email verification, password reset, refresh-token rotation. Logout clears the cookies; protected requests then fail. Tokens live only in HttpOnly cookies — never in LocalStorage or URLs.

### `GET /api/products`
List products. Optional `?category=Audio`.
```json
{ "success": true, "data": { "products": [ { "id": "…", "name": "…", "price": 1299900, "image": "…", "category": "Audio", "stock": 25 } ], "count": 8 } }
```

### `GET /api/products/:id`
Single product. `404` if not found, `400` if the id is malformed.

### `POST /api/payments/create-order`
Validates products/stock, computes the total **server-side**, creates a pending order and a Razorpay order.

Request:
```json
{
  "customer": { "name": "Asha", "email": "asha@example.com", "phone": "9876543210" },
  "items": [ { "productId": "<productId>", "quantity": 2 } ]
}
```
Response `201`:
```json
{
  "success": true,
  "data": {
    "orderId": "<mongoId>",
    "orderNumber": "QC-7F3A9C2B",
    "accessToken": "<64-hex>",
    "amount": 2599800,
    "currency": "INR",
    "razorpayOrderId": "order_XXXX",
    "razorpayKeyId": "rzp_test_XXXX",
    "customer": { "name": "Asha", "email": "asha@example.com", "phone": "9876543210" }
  }
}
```
> `accessToken` is returned **once** — the client stores it to view the order confirmation. Only its hash is stored server-side.

Errors: `400` validation / invalid productId, `404` product not found, `409` out-of-stock / insufficient stock, `503` gateway not configured, `502` gateway error.

### `POST /api/payments/verify`
Verifies the HMAC-SHA256 signature, confirms the Razorpay order matches the stored order, then marks it paid and decrements stock **exactly once**.

Request:
```json
{
  "orderId": "<mongoId>",
  "razorpay_order_id": "order_XXXX",
  "razorpay_payment_id": "pay_XXXX",
  "razorpay_signature": "<signature>"
}
```
Response `200`:
```json
{ "success": true, "data": { "orderId": "…", "orderNumber": "QC-…", "status": "paid", "paymentStatus": "paid", "alreadyProcessed": false } }
```
- Repeated calls return `alreadyProcessed: true` and never decrement stock twice.
- Invalid signature → `400`, order marked `failed` (if still pending).

### `POST /api/payments/failed`
Records a cancelled/failed checkout (only if still pending).
```json
{ "orderId": "<mongoId>", "reason": "user_cancelled" }
```

### `GET /api/orders/:id`
Secure guest order lookup. **Requires the access token** via `x-access-token` header or `?token=` query. Wrong/missing token returns `404` (does not reveal existence).
```json
{ "success": true, "data": { "order": { "id": "…", "orderNumber": "QC-…", "items": [...], "amount": 2599800, "status": "paid", "paymentStatus": "paid" } } }
```

---

## Money & currency
All prices/amounts are stored and calculated as **integer paise** (1 INR = 100 paise) to avoid floating-point errors. Razorpay also expects paise, so there is no conversion at the gateway. The frontend divides by 100 for display. The seed script uses `rupeesToPaise()` so the source data stays readable.

## Payment flow & security
1. Frontend sends customer details + `{ productId, quantity }[]` to `create-order`.
2. Backend revalidates each product, its price and stock from MongoDB.
3. Backend computes the total independently (paise) — **the frontend amount is never trusted**.
4. Backend creates a **pending** order (with a hashed access token) and a Razorpay order.
5. Frontend opens Razorpay Checkout with the public `razorpayKeyId` + `razorpayOrderId`.
6. On success, frontend posts `order_id` / `payment_id` / `signature` to `verify`.
7. Backend verifies HMAC-SHA256 of `order_id|payment_id` with the key **secret**, using `crypto.timingSafeEqual` (constant-time).
8. Backend confirms the Razorpay order id matches the stored order.
9. Only a valid signature flips the order to **paid**.
10. The pending→paid transition is an **atomic single-document update**, so repeated/concurrent verifies don't double-process or decrement stock twice. Stock decrements use guarded `$inc` (`stock >= qty`) so stock can't go negative.
11. Cancelled/failed checkouts are recorded via `/payments/failed`.
12. The Razorpay **secret** never leaves the server; access tokens, signatures and secrets are never logged.

> **Idempotency note:** this uses atomic single-document updates and does **not** require MongoDB transactions, so a standalone `mongod` works. If you later wrap multi-document writes in a transaction, MongoDB must run as a **replica set** (Atlas clusters already are).

> **Webhooks:** Not implemented. In production you would add a Razorpay webhook (`payment.captured` / `order.paid`) with webhook-signature verification as the source of truth, in addition to the client-side verify call. This is a documented production enhancement only.

## Razorpay test-mode setup
1. Sign up at [razorpay.com](https://razorpay.com) and stay in **Test mode**.
2. Dashboard → **Settings → API Keys → Generate Test Key**.
3. Put `rzp_test_…` in `RAZORPAY_KEY_ID` and the secret in `RAZORPAY_KEY_SECRET`.
4. Use Razorpay's [test instruments](https://razorpay.com/docs/payments/payments/test-card-details/) during checkout. Note: some test accounts reject the generic Visa `4111 1111 1111 1111` as "international". The most reliable test-mode **success** is **UPI VPA `success@razorpay`** or **Netbanking → any test bank → Success**; use `failure@razorpay` to exercise the failure path.

### Payment tests
`npm test` runs the auth suite **and** a payment suite (`test/payment.test.js`) with a **mocked** Razorpay gateway (no live calls): server-side amount calc + client-amount tampering, invalid/malformed signatures, ownership mismatch, idempotent re-verify, out-of-stock + oversell guard, failure/dismissal, guest + CSRF rejection, and gateway-error + safe retry. Mocked tests are not live payment tests.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `MONGODB_URI is not set` | Create `.env` from `.env.example` and set the URI |
| `[db] connection failed` | Check the URI, that `mongod` is running, or Atlas IP allow-list |
| `503 Payment gateway is not configured` | Set `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` |
| CORS error in browser | Ensure `FRONTEND_URL` matches the frontend origin exactly |
| `400 Payment signature verification failed` | Secret mismatch, or tampered callback data |

## Testing checklist
- [ ] `npm run check` passes (all modules load)
- [ ] `GET /api/health` returns `status: ok`
- [ ] `npm run seed` inserts 8 products
- [ ] `GET /api/products` returns 8 products; `GET /api/products/:id` works and 404s on unknown id
- [ ] `create-order` rejects unknown products / insufficient stock (`404`/`409`)
- [ ] `create-order` returns a Razorpay order id + access token
- [ ] `verify` rejects a bad signature (`400`) and accepts a valid one (`200`)
- [ ] Calling `verify` twice does not decrement stock twice (`alreadyProcessed: true`)
- [ ] `GET /api/orders/:id` requires the correct access token (`404` otherwise)

## Deployment
- Host on Render / Railway / Fly.io / a VM. Set all env vars in the host dashboard (never commit them).
- Set `FRONTEND_URL` to the deployed frontend origin.
- Use a managed MongoDB (Atlas) `MONGODB_URI`.
- Start command: `npm start` (optionally under `pm2`).
- Ensure the host injects `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` as secrets.

---

### Git — push this backend to its own repository
```powershell
cd quickcart-backend
git init
git add .
git commit -m "QuickCart backend: Express + MongoDB + Razorpay"
git branch -M main
git remote add origin https://github.com/<you>/quickcart-backend.git
git push -u origin main
```
