<div align="center">

<img src="frontend/public/pwa-512.png" alt="Atithi RMS" width="110" />

# Atithi RMS — Restaurant Management System

**A multi-restaurant (SaaS) restaurant management system by CornorTech Pvt. Ltd.**

Orders · Kitchen display · Billing & VAT · Payment QR · Table QR menu · Call waiter · Loyalty · Stock · Staff roles · Works offline

</div>

---

## 📑 Table of contents

1. [What is Atithi RMS?](#-what-is-atithi-rms)
2. [Features](#-features)
3. [User roles](#-user-roles)
4. [Tech stack](#-tech-stack)
5. [How the system works](#-how-the-system-works)
6. [Folder structure](#-folder-structure)
7. [Run it on your computer](#-run-it-on-your-computer)
8. [Environment variables](#-environment-variables)
9. [Create the first admin account](#-create-the-first-admin-account)
10. [Deploy to production](#-deploy-to-production)
11. [Table QR menu & Call Waiter](#-table-qr-menu--call-waiter)
12. [Offline mode](#-offline-mode)
13. [Security](#-security)
14. [API overview](#-api-overview)
15. [Troubleshooting](#-troubleshooting)
16. [Updating the live system](#-updating-the-live-system)

---

## 🍽️ What is Atithi RMS?

Atithi RMS runs the full daily workflow of a restaurant, from taking an order at the table to printing the final bill. **Many restaurants use the same system at the same time**, and each restaurant only ever sees its own data.

- The **Admin** (CornorTech) creates restaurant accounts and manages their subscription days.
- Each **restaurant** logs in, and its **staff** sign in with their own ID and role.
- **Customers** scan a QR code on their table to see the menu and call a waiter from their phone.

---

## ✨ Features

### 🧾 Orders & Kitchen
- Create orders by table or by customer name, with order notes
- Kitchen Display: move orders through **Pending → Preparing → Ready → Served**
- Orders page: search, edit, and track every order
- Daily order summary with print

### 💰 Billing & Payments
- Create bills from served orders, with discount and VAT
- Cash, eSewa, Khalti, IMEPay, card, or **split payment** across methods
- **Pending (unpaid) bills** that can be paid later
- **Dynamic payment QR**: upload your Fonepay/bank QR once, and every bill shows a QR with the exact amount
- Printable invoices
- **Billing & VAT audit** and **total sales** reports

### 📱 Table QR (for customers)
- One QR code generated **automatically for every table**
- Each QR card shows the restaurant name, table name, and branding
- Download one QR or **print all** at once
- Customer scans → sees **View Menu** and **Call Waiter**
- Customers only ever see **that restaurant's** menu

### 🔔 Notifications
- "Call Waiter" requests appear on the **Notifications** page within 5 seconds
- Sound alert, pending count, "Attended" button, and history
- Spam protection: one call per table every 2 minutes

### 🍛 Menu, Tables & Stock
- Menu items with categories, prices, and status (Available / Sold Out / Unavailable)
- **Combo** items (e.g. Momo + Coke)
- Table management with capacity
- Stock (inventory) management

### ⭐ Loyalty program
- Enroll customers by phone number
- Earn points on bills and track tiers (Bronze, Silver, Gold, Platinum)

### 👥 Staff & Accounts
- Staff accounts with roles: **Manager, Waiter, Kitchen Staff, Cashier**
- Each role only sees and can do what it needs (checked on the server too)
- Change password, edit restaurant details
- Admin dashboard: create, edit, and deactivate restaurants, and set subscription days

### 📴 Offline mode
- The app opens and keeps working when the internet goes down
- Orders, bills, and payments are saved on the device and **synced automatically** later
- No duplicate orders or bills when syncing
- Can be **installed** like an app (PWA)

### 🌐 Other
- English and Nepali (नेपाली) language
- Works on laptop, tablet, and phone

---

## 🧑‍🍳 User roles

| Role | Can use |
|---|---|
| **Admin** (CornorTech) | Admin dashboard: all restaurant accounts and subscriptions |
| **Manager** | Everything in their restaurant: dashboard, orders, kitchen, billing, reports, menu, tables, stock, staff, settings, notifications |
| **Waiter** | Create Order, Orders, Menu (view), Notifications |
| **Kitchen Staff** | Kitchen Display, Stock |
| **Cashier** | Create Bill, Pending Bills, Tables, Billing & VAT, Total Sales, Stock |

The sidebar hides pages a role can't use, **and** the server blocks those actions, so a role can't get around it by editing the browser.

---

## 🛠️ Tech stack

| Part | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, lucide-react icons |
| Offline | vite-plugin-pwa (Workbox service worker), Dexie (IndexedDB) |
| Backend | Node.js, Express 5 |
| Database | MongoDB Atlas, Mongoose |
| Security | JWT login tokens, bcrypt password hashing, Helmet, CORS, rate limiting |
| QR codes | `qrcode`, `jsqr`, `sharp` |
| Hosting | Vercel (frontend), Render (backend), MongoDB Atlas (database) |

---

## 🧠 How the system works

```
  Customer phone ──scan table QR──►  Vercel (frontend)  ◄──── Staff laptop / tablet
                                          │
                                          ▼  HTTPS + login token
                                   Render (backend API)
                                          │
                                          ▼
                                   MongoDB Atlas (database)
```

**How restaurants are kept separate:** when anyone logs in, the server gives them a **token** that says which restaurant they belong to. For every request, the server reads the restaurant from that token, **never** from what the browser sends. So restaurant A can never read or change restaurant B's data.

---

## 📁 Folder structure

```
New - Resturant-Management-System/
├── backend/
│   ├── index.js              # Server + most API routes
│   ├── connectDb.js          # MongoDB connection
│   ├── seedAdmin.js          # Creates the first admin account (run once)
│   ├── models/               # Database tables (Mongoose schemas)
│   │   ├── login.js          #   restaurant accounts
│   │   ├── loginStaff.js     #   staff accounts
│   │   ├── menu.js, table.js, createOrder.js, bill.js, stock.js
│   │   ├── loyalty.js, QrConfig.js
│   │   ├── waiterCall.js     #   "Call Waiter" notifications
│   │   └── idempotencyKey.js #   stops duplicate orders when syncing offline data
│   ├── routes/
│   │   ├── publicMenu.js     # customer QR page (no login)
│   │   ├── tableQr.js        # generates table QR codes
│   │   ├── notifications.js  # waiter calls for staff
│   │   ├── qr.js             # payment QR (Fonepay)
│   │   └── loyalty.js
│   └── utils/
│       ├── auth.js           # login token check
│       ├── password.js       # password hashing
│       ├── subscription.js   # subscription days check
│       ├── idempotency.js    # duplicate protection
│       └── fonepayDynamicQr.js
│
└── frontend/
    ├── public/               # logo + app icons
    ├── vercel.json           # makes /scan/... links work on Vercel
    ├── vite.config.ts        # build + PWA (offline) settings
    └── src/
        ├── main.tsx          # start point (customer page OR staff app)
        ├── App.tsx           # login, sidebar, roles, pages
        ├── offline/          # offline mode (local DB, sync, status pill)
        └── components/       # all the pages
            ├── CustomerMenu.tsx      # what customers see after scanning
            ├── TableQrManager.tsx    # Settings → Table QR
            ├── Notifications.tsx     # waiter calls
            └── ... (orders, billing, kitchen, menu, stock, staff, settings)
```

---

## 💻 Run it on your computer

### What you need
- [Node.js](https://nodejs.org/) **version 22 or newer**
- A free [MongoDB Atlas](https://www.mongodb.com/atlas) database
- [Git](https://git-scm.com/)

### 1. Download the code

```bash
git clone https://github.com/cornortech/RMS.git
cd RMS
```

### 2. Start the backend

```bash
cd backend
npm install
```

Copy `backend/.env.example` to a new file called `backend/.env` and fill it in (see [Environment variables](#-environment-variables)). Then:

```bash
npm start
```

You should see:

```
✅ Database Connected Successfully.
✅ RMS server running on port 5000
```

Check it at <http://localhost:5000/health>. It should show `{"status":"ok"}`.

### 3. Start the frontend

Open a **second** terminal:

```bash
cd frontend
npm install
```

Copy `frontend/.env.example` to `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000
```

Then:

```bash
npm run dev
```

Open <http://localhost:3000>.

> **Testing offline mode or the service worker?** `npm run dev` doesn't include them. Use:
> ```bash
> npx vite build
> npx vite preview --port 3000
> ```

---

## 🔑 Environment variables

### Backend (`backend/.env` locally, **Environment** tab on Render)

| Name | Required | Example | What it does |
|---|---|---|---|
| `MONGODB_URI` | ✅ | `mongodb+srv://user:pass@cluster0.xxx.mongodb.net/rms` | Database connection |
| `JWT_SECRET` | ✅ | 96 random characters | Signs login tokens. **At least 32 characters.** |
| `ALLOWED_ORIGINS` | ✅ | `https://rms-seven-neon.vercel.app` | Websites allowed to use the API (comma separated) |
| `PUBLIC_APP_URL` | ✅ | `https://rms-seven-neon.vercel.app` | Address put inside table QR codes |
| `NODE_ENV` | ✅ in production | `production` | Hides internal error details |
| `ENFORCE_SUBSCRIPTION` | optional | `true` | Blocks restaurants whose days ran out |
| `PORT` | optional | `5000` | **Don't set on Render** (Render sets it) |
| `ADMIN_ID`, `ADMIN_PASSWORD` | only for `seedAdmin.js` | | First admin login |

Make a strong `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Frontend (`frontend/.env` locally, **Environment Variables** on Vercel)

| Name | Example | What it does |
|---|---|---|
| `VITE_API_URL` | `https://rms-elhj.onrender.com` | Backend address (no `/` at the end) |

> ⚠️ `.env` files contain passwords. They must **never** be pushed to GitHub. `.gitignore` already blocks them.

---

## 👑 Create the first admin account

Do this **once**, for a new database.

1. Add these to `backend/.env`:
   ```env
   ADMIN_ID=cornortech-admin
   ADMIN_PASSWORD=choose-a-long-password-here
   ```
   The password must be **at least 12 characters**.
2. Run:
   ```bash
   cd backend
   node seedAdmin.js
   ```
3. Log in with restaurant name **`Admin`**, your `ADMIN_ID`, and your `ADMIN_PASSWORD`.
4. Remove `ADMIN_PASSWORD` from `.env` afterwards.

From the Admin dashboard you can create restaurant accounts. Each restaurant then logs in, and its Manager creates staff in **Manage Staff**.

---

## 🚀 Deploy to production

Always deploy the **backend first**, then the frontend.

### 1. Database: MongoDB Atlas
1. Create a cluster and a database user.
2. **Network Access** → **Allow access from anywhere** (`0.0.0.0/0`), because Render's IP changes.
3. Copy the connection string for `MONGODB_URI`.

### 2. Backend: Render
1. **New → Web Service** → pick the GitHub repo.
2. Settings:
   | Setting | Value |
   |---|---|
   | Root Directory | `backend` |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
3. Add the backend environment variables from the table above. Use `NODE_ENV=production`.
4. After deploying, open `https://YOUR-BACKEND.onrender.com/health` → `{"status":"ok"}`.

> 💡 Render's **free** plan sleeps after 15 minutes, and the first request then takes about 50 seconds. For real restaurants, use the **Starter** plan.

### 3. Frontend: Vercel
1. **Add New → Project** → pick the repo.
2. Settings:
   | Setting | Value |
   |---|---|
   | Root Directory | `frontend` |
   | Framework | Vite |
   | Build Command | `npx vite build` |
   | Output Directory | `dist` |
3. Environment variable: `VITE_API_URL=https://YOUR-BACKEND.onrender.com`
4. Deploy.

### 4. Connect them
On Render, set `ALLOWED_ORIGINS` and `PUBLIC_APP_URL` to your Vercel address (with `https://`, no `/` at the end).

### 5. Custom domain (recommended before printing QR codes)
The website address is printed **inside every table QR**. Add your final domain in Vercel → **Settings → Domains** *before* printing QR codes, then update `ALLOWED_ORIGINS` and `PUBLIC_APP_URL`.

---

## 📱 Table QR menu & Call Waiter

1. Add tables on the **Tables** page.
2. Go to **Settings → Table QR**. One QR per table appears automatically.
3. **Download** or **Print all**, and place each QR on its table.
4. A customer scans the QR and sees:
   - **View Menu**: this restaurant's available items, by category, with search
   - **Call Waiter**: sends a notification to staff
5. Staff see calls on the **Notifications** page and press **Attended**.

The QR link looks like `https://your-site/scan/<restaurant>/<table>`. The server checks that the table belongs to that restaurant before showing anything.

---

## 📴 Offline mode

| Works offline | Needs internet |
|---|---|
| Create orders, change order status | Logging in |
| Create bills, pay pending bills | Menu, tables, staff, stock, settings changes |
| Loyalty points | Customer QR menu & Call Waiter |
| View menu, tables, orders, bills (last saved copy) | Orders created on *other* devices |

**Status pill (bottom-right):**

| Pill | Meaning |
|---|---|
| ⚫ Offline · N changes saved | No internet; work is saved on this device |
| 🟡 Syncing… | Uploading saved work |
| 🟢 All changes synced | Done |
| 🟠 Log in again to sync | Login expired; log in and it continues |
| 🔴 N changes could not sync | The server refused them; click to Retry or Discard |

**Rules for staff:** log in while online, open the main pages once, and don't clear browser data while changes are unsynced.

Offline mode needs **https** (or `localhost`).

---

## 🔒 Security

- **Passwords** are hashed with bcrypt (never stored as plain text)
- **Login tokens** (JWT) expire after 12 hours
- **Every request** is checked: active account, active staff, correct restaurant, correct role
- **Restaurant data is separated** on the server by the login token
- **Rate limiting** on logins (10 failed attempts per 15 minutes) and on "Call Waiter"
- **NoSQL-injection protection** (`sanitizeFilter`), strict CORS, Helmet security headers
- **No internal errors** shown to users in production
- **Duplicate protection** for offline sync (idempotency keys)

### Security checklist before going live
- [ ] `backend/.env` is **not** on GitHub
- [ ] The admin password is **not** `123`, and is 12+ characters
- [ ] `JWT_SECRET` is long and random
- [ ] `NODE_ENV=production` on Render
- [ ] `ALLOWED_ORIGINS` only contains your real website
- [ ] MongoDB Atlas backups are turned on

---

## 🔌 API overview

All routes start with `/api`. Everything except login and `/api/public/*` needs `Authorization: Bearer <token>`.

| Area | Routes |
|---|---|
| Health | `GET /health` |
| Login | `POST /auth/login`, `POST /auth/verify`, `POST /staff/login` |
| Customer (public) | `GET /public/menu/:restaurantKey/:tableId`, `POST /public/call-waiter` |
| Menu | `GET/POST /menu`, `PUT/DELETE /menu/:id` |
| Orders | `GET/POST /orders`, `PUT/DELETE /orders/:id` |
| Tables | `GET/POST /tables`, `PUT/DELETE /tables/:id` |
| Bills | `GET/POST /bills`, `PATCH /bills/:id` |
| Stock | `GET/POST /stocks`, `GET/PUT/DELETE /stocks/:id` |
| Loyalty | `GET/POST /loyalty`, `PUT/DELETE /loyalty/:id`, `PATCH /loyalty/:id/points` |
| Payment QR | `GET /qr`, `POST /qr/upload`, `POST /qr/dynamic`, `PUT/DELETE /qr/:id` |
| Table QR | `GET /table-qr` |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/attend`, `PATCH /notifications/attend-all`, `DELETE /notifications/attended` |
| Staff | `GET /staff/names`, `POST /staff/create`, `PUT/DELETE /staff/:id` |
| Admin | `GET/POST /admin/users`, `PUT/DELETE /admin/users/:id` |
| Subscription | `GET /restaurant/time` |

---

## 🧯 Troubleshooting

| Problem | Fix |
|---|---|
| "Unable to connect to authentication server" | Check `VITE_API_URL` on Vercel and that the backend `/health` works. Redeploy Vercel after changing it. |
| Login works on one site but not another | Add that site to `ALLOWED_ORIGINS` on Render (with `https://`, no `/` at the end). |
| Scanning a QR shows **404 NOT_FOUND** | `frontend/vercel.json` is missing or not pushed. Vercel's Root Directory must be `frontend`. |
| QR page says "Could not load the menu" | Check `ALLOWED_ORIGINS` and `VITE_API_URL`. |
| QR link points to `localhost` | Set `PUBLIC_APP_URL` on Render, then click **Refresh** on Settings → Table QR. |
| First request is very slow | Render's free plan was asleep. Upgrade to Starter. |
| "Your subscription has expired" | The Admin must add days to that restaurant in the Admin dashboard. |
| Backend crashes with `Cannot find module` | A file is missing or misnamed (check for `.txt` at the end). |
| Any 500 error | Look at **Render → Logs** for the red 🔴 line. |

---

## 🔄 Updating the live system

```bash
git add .
git commit -m "Describe your change"
git push
```

Render and Vercel update automatically. If you change a variable on Vercel, click **Redeploy**.

---

<div align="center">

Made with ❤️ in Nepal by **CornorTech Pvt. Ltd.**

</div>