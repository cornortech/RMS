<div align="center">

<img src="frontend/public/pwa-512.png" alt="Atithi RMS" width="110" />

# Atithi RMS

**Restaurant management system for Nepal, by CornorTech Pvt. Ltd.**

Orders · Kitchen display · Billing with VAT & IRD bill numbers · Payment QR · Table QR menu · Online delivery · Riders · Loyalty · Stock · Staff & fingerprint attendance · Works offline

</div>

---

## Contents

1. [Overview](#overview)
2. [Features](#features)
3. [User roles](#user-roles)
4. [Tech stack](#tech-stack)
5. [Architecture](#architecture)
6. [Folder structure](#folder-structure)
7. [Run locally](#run-locally)
8. [Environment variables](#environment-variables)
9. [First admin account](#first-admin-account)
10. [Deploy to production](#deploy-to-production)
11. [Table QR menu and Call Waiter](#table-qr-menu-and-call-waiter)
12. [Online delivery and riders](#online-delivery-and-riders)
13. [Fingerprint attendance](#fingerprint-attendance)
14. [Offline mode](#offline-mode)
15. [Security](#security)
16. [API overview](#api-overview)
17. [Health check and monitoring](#health-check-and-monitoring)
18. [Troubleshooting](#troubleshooting)
19. [Updating the live system](#updating-the-live-system)

---

## Overview

Atithi RMS runs the daily work of a restaurant: taking orders, the kitchen, billing, payments, delivery, stock, staff and reports. **Many restaurants share one system**, and each restaurant only ever sees its own data.

- The **Admin** (CornorTech) creates restaurant accounts and manages subscription days.
- Each **restaurant** logs in on its devices, then **staff** sign in with their own ID and role.
- **Customers** scan a table QR to see the menu and call a waiter, or order online for delivery.
- **Riders** use their own phone app to take and deliver orders.

---

## Features

### Orders and kitchen
- Create orders by **table** or by **customer name / phone** (phone-only customers are saved too), with order notes
- Saved customers: typing a phone number fills in the name and address
- Warning when a customer's phone has **cancelled bills** before
- **Kitchen Display**: Pending → Preparing → Ready → Served, with KOT printing
- Optional: **skip beverages on the KOT** (Settings → Features)
- Orders page: search, edit, cancel and track every order
- Daily order summary with print and Excel download

### Billing and payments
- Create bills from served orders with **discount** (% or amount), **VAT** (on/off and rate in Settings → Features) and **delivery charge**
- Payment by **Cash, eSewa, Khalti, Fonepay**, or **split** across several methods
- **Pay later (Pending)**: bills of the same customer are merged, so they pay once
- **Delivery bills**: money collected by the rider is marked paid later
- **Print a pre-bill** (marked *PRE-BILL, NOT PAID*) before the bill is created
- **Dynamic payment QR**: upload your eSewa / Khalti / Fonepay QR once; each bill shows a QR with the exact amount
- **IRD bill numbers** per fiscal year, given by the server (e.g. `2083/84-00001`)
- **Cancel a bill** with a reason: it gets a **credit note** number, stays on record, and is removed from sales and from Create Bill
- Thermal (80 mm) receipt printing

### Reports
- **Dashboard**: daily revenue (dine-in, delivery, **food** and **beverage**), last 7 days, bills, orders, top items, staff activity, subscription days left
- **Total Sales**: day by day, with Excel download
- **Billing & VAT Audit**: payment-mode breakdown, taxable amount, VAT collected and the full invoice ledger (including cancelled bills and credit notes)
- Dates in **AD and Nepali BS**

### Table QR (customers)
- One QR per table, made automatically, with the restaurant name and branding
- Download one QR or print all
- Customer scans → **View Menu** (that restaurant only) and **Call Waiter**

### Notifications
- "Call Waiter" requests appear on the **Notifications** page with sound, a pending count and an **Attended** button
- Spam protection: one call per table every 2 minutes

### Online delivery and riders
- Public **online ordering page** for each restaurant: open/closed switch, delivery areas and charges, minimum order, free delivery above an amount, cash on delivery or online payment (with payment QR)
- Customers get a **tracking link** with live status
- Delivery hub for staff: orders, riders, reports and settings
- **Rider app** (phone): riders log in with phone + PIN, see assigned orders, update status and share location
- Live updates with Socket.IO; optional Google Maps

### Menu, tables and stock
- Menu with categories (Appetizer, Main Course, Dessert, **Beverage**, Side, Combo, Other), prices, status and **photos** (Cloudinary)
- **Combo** items (e.g. Momo + Coke)
- Tables with capacity
- Stock (inventory) management

### Loyalty
- Loyalty programs, enrol customers by phone, earn points on paid bills, tiers (Bronze, Silver, Gold, Platinum)

### Staff and attendance
- Staff roles: **Manager, Waiter, Kitchen Staff, Cashier**; each role sees and can do only what it needs (checked on the server too)
- **Fingerprint attendance** (ZKTeco-style machines over ADMS / `iclock`), manual entries, daily view, reports and Excel export

### Admin
- Create, edit, turn on/off and delete restaurant accounts; set subscription days
- Admin login protected by an **email code** (Brevo or Google Apps Script)

### Other
- English and Nepali (नेपाली)
- Works on laptop, tablet and phone; can be **installed** as an app (PWA)
- **Offline mode** with automatic sync (see below)

---

## User roles

| Role | Pages |
|---|---|
| **Admin** (CornorTech) | Admin dashboard: all restaurants and subscriptions |
| **Manager** | Everything in their restaurant, including staff, attendance and settings |
| **Waiter** | Create Order, Orders, Menu (view), Notifications, Delivery |
| **Kitchen Staff** | Kitchen Display, Stock, Delivery |
| **Cashier** | Create Bill, Pending Bills, Delivery Bills, Tables, Billing & VAT Audit, Total Sales, Stock, Delivery |

The sidebar hides pages a role can't use, **and** the server refuses those actions, so editing the browser doesn't get around it.

---

## Tech stack

| Part | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, lucide-react |
| Offline | vite-plugin-pwa (Workbox service worker), Dexie (IndexedDB) |
| Live updates | Socket.IO |
| Backend | Node.js 24, Express 5 |
| Database | MongoDB Atlas, Mongoose 8 |
| Security | JWT, bcrypt, Helmet, CORS allow-list, rate limiting, Content-Security-Policy |
| Files and email | Cloudinary (menu photos), Brevo or Google Apps Script (admin email code) |
| QR | `qrcode`, `jsqr`, `sharp` |
| Hosting | Vercel (frontend), Render (backend), MongoDB Atlas (database) |

---

## Architecture

```
 Customer phone ─ table QR / online order / tracking ─┐
 Rider phone ─ rider app ─────────────────────────────┤
 Staff laptop / tablet ───────────────────────────────┤
                                                      ▼
                                       Vercel (frontend, PWA)
                                                      │  HTTPS + login token, WebSocket
                                                      ▼
                                       Render (backend API)  ◄── fingerprint machines (/iclock)
                                                      │
                                                      ▼
                                       MongoDB Atlas (database)
```

**How restaurants are kept apart:** at login the server gives a **token** that says which restaurant (and which staff member) it belongs to. Every request reads the restaurant from that token, never from what the browser sends, and every record is checked to belong to that restaurant. Live updates are sent only to that restaurant's room.

---

## Folder structure

```
backend/
├── index.js               # Express app: security setup, login, menu, orders, tables, bills, stock, staff, admin
├── connectDb.js           # MongoDB connection
├── seedAdmin.js           # Creates the first admin account (run once)
├── models/                # Mongoose schemas
│   ├── login.js, loginStaff.js        # restaurant and staff accounts
│   ├── menu.js, table.js, createOrder.js, bill.js, stock.js, customerName.js
│   ├── counter.js                      # IRD bill and credit-note numbers
│   ├── loyalty.js, loyaltyProgram.js, QrConfig.js, restaurantFeatures.js
│   ├── deliveryOrder.js, deliverySettings.js, deliveryMenuExtra.js, rider.js
│   ├── attendance*.js                  # attendance, devices, logs, settings
│   ├── waiterCall.js, adminOtp.js, idempotencyKey.js
├── routes/
│   ├── publicMenu.js      # customer QR menu + call waiter (no login)
│   ├── deliveryOnline.js  # online ordering + tracking (no login)
│   ├── riderApp.js        # rider app (rider login)
│   ├── delivery.js        # delivery hub for staff
│   ├── attendance.js, iclock.js       # attendance + fingerprint machines
│   ├── loyalty.js, qr.js, tableQr.js, notifications.js, features.js, menuImage.js
├── services/              # attendance and fingerprint device helpers
└── utils/                 # auth, passwords, bill numbers, Nepali dates, realtime, payment QR, idempotency …

frontend/
├── index.html
├── vercel.json            # SPA routing + security headers (CSP, HSTS …)
├── vite.config.ts         # build + PWA settings
├── public/                # logo, app icons, robots.txt, sitemap.xml
└── src/
    ├── main.tsx           # start: staff app, QR menu (/scan), online order (/order), tracking (/track), rider app (/rider)
    ├── App.tsx            # login, sidebar, roles, pages
    ├── components/        # pages (orders, billing, kitchen, menu, stock, staff, settings, reports …)
    │   └── delivery/      # delivery hub, online order, tracking, rider app
    ├── delivery/          # shared delivery code (sockets, maps, pay QR)
    ├── offline/           # offline mode (local DB, sync, status banner)
    └── utils/             # receipt printing, Nepali dates
```

---

## Run locally

**You need:** Node.js 22 or newer (Render uses 24), Git, and a MongoDB Atlas database (a free one is fine for testing).

### 1. Get the code

```bash
git clone https://github.com/cornortech/RMS.git
cd RMS
```

### 2. Backend

```bash
cd backend
npm install
```

Create `backend/.env` (see [Environment variables](#environment-variables)), then:

```bash
npm start
```

You should see `Database Connected Successfully` and `RMS server running on port 5000`. Open <http://localhost:5000/health>; it should show `"status":"ok"` and `"database":"connected"`.

### 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
```

Then:

```bash
npm run dev
```

Open <http://localhost:3000>.

**Testing offline mode or the installed app?** `npm run dev` doesn't include the service worker. Use:

```bash
npm run build
npm run preview
```

**Check the code:** `npm run lint` (TypeScript check).

---

## Environment variables

### Backend (`backend/.env` locally, **Environment** tab on Render)

| Name | Needed | Example | Purpose |
|---|---|---|---|
| `MONGODB_URI` | yes | `mongodb+srv://user:pass@cluster0.xxx.mongodb.net/rms` | Database connection |
| `JWT_SECRET` | yes | 96 random characters | Signs login tokens. At least 32 characters |
| `ALLOWED_ORIGINS` | yes | `https://atithi.cornortech.com,https://rms-seven-neon.vercel.app` | Websites allowed to use the API (comma separated, `https://`, no `/` at the end) |
| `PUBLIC_APP_URL` | yes | `https://atithi.cornortech.com` | Address put inside table QR, online-order and rider links |
| `NODE_ENV` | yes, in production | `production` | Hides internal error details |
| `ADMIN_OTP_EMAIL` | yes | `you@example.com` | Where the admin login code is sent |
| `BREVO_API_KEY`, `MAIL_FROM` | one email option | | Send the admin code with Brevo |
| `GAS_URL`, `GAS_SECRET` | one email option | | Send the admin code with Google Apps Script (used instead of Brevo when set) |
| `ADMIN_OTP_OFF` | emergency only | `false` | `true` skips the admin email code. Keep it `false` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | optional | | Menu photos. Without them, photo upload is off |
| `ENFORCE_SUBSCRIPTION` | optional | `true` | Blocks restaurants whose days have run out |
| `PORT` | optional | `5000` | Don't set it on Render (Render sets it) |
| `ADMIN_ID`, `ADMIN_PASSWORD` | only for `seedAdmin.js` | | First admin login. Remove the password afterwards |

Make a strong `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Frontend (`frontend/.env` locally, **Environment Variables** on Vercel)

| Name | Example | Purpose |
|---|---|---|
| `VITE_API_URL` | `https://rms-elhj.onrender.com` | Backend address (no `/` at the end) |
| `VITE_GOOGLE_MAPS_KEY` | optional | Shows maps in delivery tracking. Without it, map links open Google Maps |

> `.env` files contain passwords. **Never** push them to GitHub. `.gitignore` blocks them; check with `git status` before every commit.
>
> If you change the backend address, also change it in the `Content-Security-Policy` line in `frontend/vercel.json` (`connect-src`), or the app can't reach the API.

---

## First admin account

Do this **once**, for a new database.

1. Add to `backend/.env`:
   ```env
   ADMIN_ID=cornortech-admin
   ADMIN_PASSWORD=choose-a-long-password-here
   ```
   The password must be at least 12 characters.
2. Run:
   ```bash
   cd backend
   node seedAdmin.js
   ```
3. Log in with restaurant name **`Admin`**, your `ADMIN_ID` and password. A **6-digit code** is emailed to `ADMIN_OTP_EMAIL`; enter it to finish logging in.
4. Remove `ADMIN_PASSWORD` from `.env`.

From the Admin dashboard, create restaurant accounts. Each restaurant logs in, and its Manager adds staff in **Manage Staff**.

---

## Deploy to production

Deploy the **backend first**, then the frontend.

### 1. Database: MongoDB Atlas
1. Create a cluster and a database user with a **long random password**.
2. **Network Access** → allow `0.0.0.0/0` (Render's IP address changes).
3. Turn on **backups**.
4. Copy the connection string for `MONGODB_URI`.

### 2. Backend: Render
1. **New → Web Service** → choose the GitHub repo.
2. Settings: Root Directory `backend`, Build Command `npm install`, Start Command `npm start`.
3. Add the backend environment variables. Use `NODE_ENV=production`.
4. **Health Check Path:** `/health`. Render then restarts the server if the database connection breaks.
5. After deploying, open `https://YOUR-BACKEND.onrender.com/health` and check for `"database":"connected"`.

> Render's **free** plan sleeps after 15 minutes without visitors; waking takes about a minute. For live restaurants use a **paid** instance, or at least ping `/health` every 10 minutes with an uptime monitor.

### 3. Frontend: Vercel
1. **Add New → Project** → choose the repo.
2. Settings: Root Directory `frontend`, Framework **Vite**, Build Command `npm run build`, Output Directory `dist`.
3. Environment variable: `VITE_API_URL=https://YOUR-BACKEND.onrender.com`.
4. Deploy.

### 4. Connect them
On Render, set `ALLOWED_ORIGINS` and `PUBLIC_APP_URL` to your website address(es). Add **every** address people use (for example both the `vercel.app` address and your own domain).

### 5. Custom domain
The website address is printed **inside every table QR**. Add your final domain in Vercel → **Settings → Domains** before printing QR codes, then update `ALLOWED_ORIGINS` and `PUBLIC_APP_URL`.

---

## Table QR menu and Call Waiter

1. Add tables on the **Tables** page.
2. Open **Settings → Table QR**. One QR per table appears.
3. **Download** or **Print all**, and put each QR on its table.
4. A customer scans it and sees **View Menu** and **Call Waiter**.
5. Staff see calls on **Notifications** and press **Attended**.

QR links look like `https://your-site/scan/<restaurant>/<table>`. The server checks the table belongs to that restaurant before showing anything.

---

## Online delivery and riders

1. **Delivery → Settings**: open or close online ordering, choose cash on delivery and/or online payment, set delivery areas and charges, the minimum order, free delivery above an amount, and the restaurant location.
2. Share the **online order link** (`https://your-site/order/<restaurant>`) on Facebook, WhatsApp or Google.
3. Customers order and get a **tracking link** (`/track/<code>`) with live status.
4. **Delivery → Riders**: add riders with a phone number and PIN. They open the **rider link** (`/rider/<restaurant>`) on their phone and log in.
5. Delivery money is settled in **Delivery Bills**.

---

## Fingerprint attendance

1. **Attendance → Devices**: add the machine's **serial number**.
2. On the machine open **Menu → Comm. → Cloud Server Setting** (some models call it **ADMS**) and enter the **server address, port and HTTPS** exactly as shown on **Attendance → Devices**.
3. **Attendance → Devices**: link each staff member to their **user ID on the machine**.
4. Scans appear in **Attendance**. Manual entries, reports and Excel export are on the same page.

Only machines whose serial number is registered are accepted.

---

## Offline mode

| Works offline | Needs internet |
|---|---|
| Create orders, change order status | Logging in |
| Create bills, pay pending bills | Menu, tables, staff, stock and settings changes |
| Loyalty points | Customer QR menu, online orders, rider app |
| View menu, tables, orders, bills (last saved copy) | Orders made on *other* devices |

**Status banner:**

| Banner | Meaning |
|---|---|
| Offline · N changes saved | No internet; work is saved on this device |
| Syncing… | Uploading saved work |
| All changes synced | Done |
| Log in again to sync | Login expired; log in and syncing continues |
| N changes could not sync | The server refused them; Retry or Discard |

**For staff:** log in while online, open the main pages once a day, and never clear browser data while changes are waiting to sync. Offline mode needs **https** (or `localhost`).

---

## Security

- Passwords hashed with **bcrypt**; never stored or shown as plain text
- **Login tokens** (JWT) expire after 24 hours; account, staff, restaurant and role are re-checked on **every** request
- **Restaurant data is separated** on the server using the login token; every record is checked to belong to that restaurant
- **Roles enforced on the server**, not only in the menu
- **Admin login needs an email code**
- **Rate limits** on logins (10 failed tries per 15 minutes), rider logins, online orders and Call Waiter
- **NoSQL-injection protection** (`sanitizeFilter`), strict **CORS allow-list**, **Helmet** headers on the API
- **Content-Security-Policy**, HSTS and other security headers on the website (`frontend/vercel.json`)
- **Bills are never deleted**: cancelling gives a credit note (IRD rule)
- **No internal error details** shown to users
- **Duplicate protection** when offline work is synced (idempotency keys)

### Checklist before going live
- [ ] No `.env` file is on GitHub, and no password is in the Git history (if one ever was, **change that password**)
- [ ] The GitHub repository is **private**
- [ ] `JWT_SECRET` is long and random
- [ ] Admin password is 12+ characters, and `ADMIN_OTP_OFF=false`
- [ ] `NODE_ENV=production` on Render
- [ ] `ALLOWED_ORIGINS` only lists your real websites
- [ ] MongoDB Atlas backups are on
- [ ] `npm audit` shows no problems in `backend` and `frontend`

---

## API overview

All API routes start with `/api`. Everything needs `Authorization: Bearer <token>` except login, `/api/public/*`, `/api/online/*` and the rider-app login.

| Area | Routes |
|---|---|
| Health | `GET /health` (no `/api`) |
| Login | `POST /auth/login`, `POST /auth/admin-otp/verify`, `POST /auth/admin-otp/resend`, `POST /auth/verify`, `POST /staff/login` |
| Customer QR (public) | `GET /public/menu/:restaurantKey/:tableId`, `POST /public/call-waiter` |
| Online order (public) | `GET /online/:restaurantKey/menu`, `POST /online/:restaurantKey/quote`, `POST /online/:restaurantKey/orders`, `GET /online/track/:token`, `POST /online/track/:token/cancel`, `GET /online/track/:token/pay-qr` |
| Rider app | `POST /rider-app/login`, `GET /rider-app/me`, `GET /rider-app/me/orders`, `PATCH /rider-app/me/orders/:id/status`, `POST /rider-app/me/location` |
| Menu | `GET/POST /menu`, `PUT/DELETE /menu/:id`, menu photos under `/menu` |
| Orders | `GET/POST /orders`, `PUT/DELETE /orders/:id` |
| Tables | `GET/POST /tables`, `PUT/DELETE /tables/:id` |
| Bills | `GET/POST /bills`, `PATCH /bills/:id`, `POST /bills/:id/cancel`, `GET /cancel-history` |
| Customers | `POST /customers`, `GET /customers/:restaurantId`, `PUT/DELETE /customers/:id` |
| Stock | `GET/POST /stocks`, `GET/PUT/DELETE /stocks/:id` |
| Loyalty | `/loyalty` (members, programs, points) |
| Payment QR | `GET /qr`, `POST /qr/upload`, `POST /qr/dynamic`, `PUT/DELETE /qr/:id` |
| Table QR | `GET /table-qr` |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/attend`, `PATCH /notifications/attend-all`, `DELETE /notifications/attended` |
| Delivery (staff) | `/delivery/*` (orders, riders, reports, settings) |
| Attendance | `/attendance/*` (Manager only); machines use `/iclock` |
| Features | `GET/PUT /features` |
| Staff | `GET /staff/names`, `POST /staff/create`, `PUT/DELETE /staff/:id` |
| Admin | `GET/POST /admin/users`, `PUT/DELETE /admin/users/:id` |

---

## Health check and monitoring

`GET /health` (no login, no CORS limits, never cached):

```json
{ "status": "ok", "database": "connected", "uptimeSeconds": 5321 }
```

- `200` and `"database":"connected"`: all good
- `503` and `"database":"disconnected"`: the server is running but can't reach MongoDB

Use it for Render's **Health Check Path** and an uptime monitor (e.g. UptimeRobot, every 5–10 minutes). The app also uses it to decide when to sync offline work.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Unable to connect" / "Origin not allowed" | Add the exact website address to `ALLOWED_ORIGINS` on Render (`https://`, no `/` at the end), and check `VITE_API_URL` on Vercel. Redeploy Vercel after changing it |
| App shows **offline** in the morning | Render's free plan was asleep. Use a paid instance or an uptime monitor on `/health` |
| `/health` shows `"database":"disconnected"` | Check MongoDB Atlas is running, the password in `MONGODB_URI` is right, and Network Access allows `0.0.0.0/0` |
| Blank page after a deploy | Delete `frontend/node_modules`, run `npm install`, build again. React and React-DOM versions must match |
| Page loads but some images or maps don't | A site is missing from the `Content-Security-Policy` in `frontend/vercel.json` |
| Scanning a QR shows **404** | `frontend/vercel.json` missing or not pushed; Vercel Root Directory must be `frontend` |
| QR link points to `localhost` | Set `PUBLIC_APP_URL` on Render, then **Refresh** in Settings → Table QR |
| "Your subscription has expired" | The Admin adds days to that restaurant in the Admin dashboard |
| Admin email code doesn't arrive | Check `ADMIN_OTP_EMAIL` and the Brevo (or Google Apps Script) settings |
| Any 500 error | Look at **Render → Logs** for the `UNHANDLED ERROR` line |

---

## Updating the live system

```bash
git status            # make sure no .env file is listed
git add .
git commit -m "Describe your change"
git push
```

Render and Vercel update automatically. After changing a variable on Vercel, click **Redeploy**.

Every few weeks, run `npm audit` in `backend` and `frontend` and apply safe fixes with `npm audit fix`.

---

<div align="center">

Made in Nepal by **CornorTech Pvt. Ltd.**

</div>