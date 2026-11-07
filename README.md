# Vibe Coding With al - TempMail (Full-Stack Disposable Email Service)

A modern, fast, and privacy-focused disposable temporary email service built with the **MERN stack** (MongoDB, Express, React, Node.js) and supporting both **native SMTP server ingestion** and **free serverless webhook ingestion via Cloudflare Email Routing**.

---

## 🚀 Key Features

- **⚡ Instant Temporary Inboxes:** Randomly generates temporary email addresses with automatic countdown timers (configurable TTL).
- **🌐 Custom Domain Support:** Built-in multi-domain support with active domain management (e.g. `tggtg.online`).
- **🛡️ Secure Message Viewer:**
  - Content Security Policy (CSP) blocking external tracking pixels and remote scripts.
  - HTML body sanitization with **DOMPurify** inside sandboxed iframes.
- **⏱️ Auto-Expiring TTL Data:** Inboxes and messages automatically expire and clean themselves up via MongoDB TTL indexes.
- **📊 Admin Dashboard (`/admin`):**
  - Protected with JWT authentication and rate limiting.
  - Live statistics: active mailboxes, messages received, and daily charts.
  - Domain manager: add, toggle active status, and remove email domains.
  - System controls: adjust message size limits and inbox lifespan.
- **📊 Operations, Analytics & Charts:** Daily activity timeline, peak hours (00-23 UTC), top sender domains, and geographic breakdown (`CF-IPCountry`).
- **🛡️ Abuse Controls & Spam Scoring:** Blocklists for sender domains, addresses, and IPs; automated spam score (0-100%); message report button in reader with admin 1-click block.
- **👥 Admin Roles & RBAC:** Owner vs Moderator roles, account enable/disable, and full AuditLog tracking.
- **🔐 Admin Security & TOTP 2FA:** Two-factor authentication via `otplib` (QR code setup, TOTP verification, 8 one-time backup codes) and in-dashboard password change.
- **🚨 System Health & Monitoring:** `GET /api/health` endpoint, live failure logging (`Failure` collection), 24h failure banner when >10 failures, and optional `ALERT_WEBHOOK_URL` notification webhook.
- **💾 Configuration Backups:** 1-click export of domains, settings, blocklists, and blog articles to JSON, plus import with dry-run preview.
- **⭐ Premium Accounts & Billing:** User authentication with JWT + bcrypt, Stripe Checkout integration, 7-day inboxes, 100% ad-free experience, and admin user/premium manager.
- **⚡ Developer REST API v1 (`/api/docs`):** Programmatic temporary inbox generation and message retrieval authenticated via secure `X-Api-Key` headers with prefix `tm_` and per-key rate limiting (60 req/min).
- **📰 Blog & Dynamic SEO (`/blog`):** MongoDB-powered articles with dynamic SSR meta tag injection, automated `/sitemap.xml`, and `/robots.txt`.
- **🩺 Automated DNS MX Health Checks:** 24-hour background job and 1-click admin DNS check flagging domains as Healthy, Warning, or Failing with auto-pause to prevent broken inboxes.
- **📢 Advertising System:** 3 configurable placements (header banner, below address card, sidebar) outside iframe with global toggle and automatic suppression for Premium subscribers.
- **🔑 High-Visibility Verification & OTP UI:** Prominently extracts and styles OTP codes with 1-click copy, and magic sign-in links ("Sign in to Service ↗") with full mobile responsiveness.
- **Dual Email Ingestion Engines:**
  - **Option 1 (VPS):** Built-in Node.js SMTP server (`smtp-server`) listening directly on Port 25.
  - **Option 2 (100% Free / Serverless):** Cloudflare Email Routing + Cloudflare Email Worker webhook (`POST /api/inbound`) — no VPS or open port 25 needed!

---

## 🛠️ Tech Stack

- **Frontend:** React 18, Vite, React Router, DOMPurify, Tailwind CSS v4
- **Backend:** Node.js (ESM), Express 4, Mongoose 8, Helmet, CORS, JSON Web Token (JWT), `bcryptjs`, `express-rate-limit`, `mailparser`, Stripe SDK
- **Mail Engine:** `smtp-server`, `mailparser`, Cloudflare Email Workers
- **Database:** MongoDB (Local or MongoDB Atlas Cloud M0 Free Tier)

---

## 📁 Project Structure

```
tempmail-fullstack/
├── backend/
│   ├── src/
│   │   ├── models.js        # MongoDB Mongoose schemas (Mailbox, Message, Domain, Admin, Stat)
│   │   ├── server.js        # Express application & static frontend server
│   │   ├── seed.js          # Database seed script for admin user & default domain
│   │   ├── smtp.js          # Native SMTP server engine
│   │   └── routes/
│   │       ├── public.js    # Public endpoints (/mailbox, /messages, /inbound webhook)
│   │       └── admin.js     # Admin endpoints (/login, /stats, /domains, /settings)
│   ├── .env.example         # Environment template
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.jsx     # User temporary inbox page with live countdown
│   │   │   └── Admin.jsx    # Admin dashboard & domain manager
│   │   ├── api.js           # API client helper
│   │   └── styles.css       # Clean, modern UI styling
│   ├── vite.config.js       # Vite build & local proxy configuration
│   └── package.json
├── cloudflare-worker.js     # Cloudflare Email Worker for free mail routing (zero dependencies)
├── wrangler.toml            # Wrangler configuration for Cloudflare Worker deployment
├── .gitignore               # Security & dependency ignores
├── package.json             # Root orchestrator for build & deployment
└── README.md
```

---

## 💻 Quick Start (Local Development)

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- Local [MongoDB](https://www.mongodb.com/) running or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster.

### 2. Configure Backend
```powershell
cd backend
Copy-Item .env.example .env
```
Open `backend/.env` and configure your environment:
```env
PORT=4000
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/tempmail?retryWrites=true&w=majority
JWT_SECRET=CHANGE_ME_LONG_RANDOM_VALUE
SMTP_PORT=2525
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=CHANGE_ME_LONG_RANDOM_VALUE
DEFAULT_DOMAIN=tggtg.online
INBOUND_SECRET=CHANGE_ME_LONG_RANDOM_VALUE
```

> **Generating secure random secrets:**
> ```bash
> openssl rand -hex 48
> # or using Node.js:
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

### 3. Seed Database
Initialize the admin user and default domain in MongoDB:
```powershell
npm run seed
```

### 4. Run the Servers
Open two terminals:

**Terminal 1 (Backend):**
```powershell
cd backend
npm run dev
```

**Terminal 2 (Frontend):**
```powershell
cd frontend
npm install
npm run dev
```

- **App:** [http://localhost:5173](http://localhost:5173)
- **Admin Dashboard:** [http://localhost:5173/admin](http://localhost:5173/admin)

### 5. Running Automated Tests
```powershell
npm test
# or inside backend:
cd backend
npm test
```
The test suite uses Vitest, Supertest, and `mongodb-memory-server` to execute integration tests covering mailbox creation, private token security, inbound webhooks, oversize payload handling, TTL propagation, admin auth, and domain management.

---

## 🌐 Free Cloud Deployment (Render + MongoDB Atlas + Cloudflare)

You can run this full-stack application completely for **$0/month** without renting a VPS:

### Step 1: Database (MongoDB Atlas)
1. Create a free M0 cluster on [MongoDB Atlas](https://cloud.mongodb.com/).
2. Under **Database Access**, create a user.
3. Under **Network Access**, allow access from anywhere (`0.0.0.0/0`).
4. Copy your connection string into `backend/.env`.

### Step 2: Deploy to Render.com (Web Service)
1. Push this repository to GitHub.
2. In [Render](https://render.com), create a **New Web Service** and select your GitHub repo.
3. Settings:
   - **Environment:** `Node`
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
4. In **Environment Variables**, add:
   - `MONGO_URI`: Your MongoDB Atlas connection string
   - `JWT_SECRET`: A secure random 32+ character string (e.g. generated via `openssl rand -hex 48`)
   - `DEFAULT_DOMAIN`: `tggtg.online`
   - `INBOUND_SECRET`: A secure secret string for webhook authorization
   - `PORT`: `4000`
   - `TURNSTILE_SECRET`: (Optional) Cloudflare Turnstile secret key for bot abuse protection.
   - `VITE_TURNSTILE_SITEKEY`: (Optional) Cloudflare Turnstile site key for frontend verification.

> ⚠️ **Important Note on Render Free Tier Sleep & Uptime Pinger:**
> Render's free web services spin down (sleep) after 15 minutes of inactivity. When asleep, cold starts can take ~50 seconds, which will cause the Cloudflare Worker to time out and bounce incoming mail. To prevent this, set up a free uptime monitor (such as [UptimeRobot](https://uptimerobot.com/), [cron-job.org](https://cron-job.org/), or [BetterStack](https://betterstack.com/)) to ping your app URL (`https://your-app.onrender.com/api/domains`) every 5 to 10 minutes to keep the service awake.

### Step 3: Cloudflare Free Email Ingestion & Worker Setup
1. Add your domain (`tggtg.online`) to [Cloudflare](https://cloudflare.com) (Free Plan) and update nameservers at your registrar.
2. In Cloudflare Dashboard, go to **Workers & Pages** -> **Create application** -> **Create Worker**:
   - Give it a name (e.g., `tempmail-router` or your generated worker name like `bold-moon-78fb`).
   - Click **Deploy**.
   - Click **Edit code**.
   - Replace the entire contents of `worker.js` with the code in [`cloudflare-worker.js`](./cloudflare-worker.js).
   - *(Note: The code includes both `email()` and `fetch()` handlers. The `fetch()` handler prevents the Cloudflare preview error `"No fetch handler!"` and allows health-check previews in browser).*
   - Under **Settings** -> **Variables and Secrets**, add:
     - `BACKEND_URL`: `https://temp-mail-lx1t.onrender.com` (or your Render URL, ensure correct spelling without typos)
     - `INBOUND_SECRET`: `tempmail_secret_2026` (must match the `INBOUND_SECRET` in your backend / Render dashboard)
   - Click **Save and Deploy**.
3. In Cloudflare, go to **Email Routing** -> **Routing Rules**:
   - Under **Catch-all rule**, select **Action: Send to a Worker** -> Select your Worker (`bold-moon-78fb` or `tempmail-router`).
   - Enable the rule.
4. All incoming emails sent to any `@tggtg.online` address will now automatically route through the worker into your TempMail inbox!

### Step 4: Render Environment Variables (Firebase & NOWPayments)
In your Render Dashboard -> Service -> **Environment**:
- Add Firebase variables:
  - `FIREBASE_PROJECT_ID`: `temp-sms-d6d3a`
  - `FIREBASE_API_KEY`: your Firebase Web API key
  - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` (for Vite frontend)
- Add NOWPayments variables:
  - `NOWPAYMENTS_API_KEY`: your NOWPayments API key
  - `NOWPAYMENTS_IPN_SECRET`: your NOWPayments IPN secret key
- Add Inbound webhook secret:
  - `INBOUND_SECRET`: `tempmail_secret_2026`

---

## 🐳 Docker & Docker Compose Deployment

Run the complete containerized stack (Node.js full-stack app + MongoDB 7) with a single command:

### 1. Start Containers
```bash
docker compose up -d
```

- **Web App & API:** [http://localhost:4000](http://localhost:4000)
- **Admin Dashboard:** [http://localhost:4000/admin](http://localhost:4000/admin)
- **Health Check:** `http://localhost:4000/api/health`
- **Native SMTP Server:** `localhost:2525`

### 2. View Logs & Container Status
```bash
docker compose logs -f app
docker compose ps
```

### 3. Stop Containers
```bash
docker compose down
```

---

## 🔒 Security Best Practices

- **Link Safety Interstitial:** In the sanitized message view, all links are analyzed and rewritten to go through an in-app confirmation page (`/confirm-link?url=...`). Links show the destination domain pill and warn against numerical IP links, Punycode/IDN lookalike domains, URL shorteners, and deceptive anchor text mismatches with `rel="noopener noreferrer nofollow"`.

- `.env` files are strictly excluded from version control via `.gitignore`.
- **Private Inboxes:** Every mailbox generates a cryptographically secure 24-byte hex token. The backend stores only the SHA-256 hash of this token. All mailbox actions (listing messages, reading a message, extending lifetime, deleting messages) require an `x-mailbox-token` header verified with constant-time equality (`crypto.timingSafeEqual`).
- **Abuse Protection:** Layered rate limiting protects address creation (10-minute and 24-hour windows, dynamically configurable via Admin Settings), with optional Cloudflare Turnstile bot verification (`TURNSTILE_SECRET` and `VITE_TURNSTILE_SITEKEY`).
- **Live Updates via Server-Sent Events (SSE):** Push notifications for incoming messages with heartbeat every 25 seconds and polling fallback.
  > *Note on Multi-Instance Deployments:* The built-in event emitter is in-process. In multi-instance or clustered production deployments behind a load balancer, swap the in-process emitter for Redis Pub/Sub.
- **Verification Helper:** Automatically detects OTP/verification codes and action links, presenting quick 1-click Copy and Open buttons without auto-navigating.
- **Secure Attachments via GridFS:** Parses email attachments, blocks dangerous file extensions (`.exe`, `.bat`, `.scr`, `.msi`, etc.), stores safe files in MongoDB GridFS, provides secure download with `X-Content-Type-Options: nosniff`, and runs an automated 10-minute cleanup job for expired files.
- **Custom Prefixes & Reserved Names:** Supports custom mailbox usernames with live availability checks and admin-configurable reserved words blocklist.
- **Multiple Inboxes Switcher:** Manage multiple concurrent temporary addresses simultaneously with individual token tracking and automatic expiration cleanup.
- **Dark Mode & Theming:** Supports light and dark modes with system `prefers-color-scheme` detection and local storage persistence.
- **Address QR Code Modal:** One-click instant QR code display for quick camera scanning and mobile address sharing.
- **Lightweight Internationalization (i18n):** Native multi-language support (English, Bengali, Arabic with auto-RTL, and Hindi).
- **Progressive Web App (PWA):** Web app manifest and custom service worker caching app shell assets only (with strict network-only bypass for APIs) and install prompt.
- **Message Actions:** Inbox keyword search (subject, sender, body), read/unread toggles, 1-click RFC 822 `.eml` download, and clean print view.
- **Expiring Shared Links:** Generate revocable, time-limited read-only public links (`/share/:token`) for individual messages (1 to 24 hours).
- On startup, the backend validates that `JWT_SECRET` is at least 32 characters and exits immediately if missing or too short.
- Inbound webhook (`POST /api/inbound`) fails closed: if `INBOUND_SECRET` is unset or empty, it rejects all requests with HTTP 503.
- Inbound webhook secret verification uses constant-time string comparison (`crypto.timingSafeEqual`) with strict length checks to prevent timing attacks.
- Admin endpoints are protected by JWT tokens with `bcryptjs` password hashing (cost factor 12).
- Incoming message bodies are never exposed in the Admin panel (metadata only).
- **CI / CD Pipeline:** GitHub Actions automatically runs backend syntax verification, integration tests, and frontend build on every push and pull request.

---

## 📄 License
MIT License. Built for educational and productivity purposes.
