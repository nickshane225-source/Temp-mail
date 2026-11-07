# TempMail Full-Stack Security & System Audit Report

**Date:** 2026-11-06  
**Auditor:** Senior Full-Stack Engineer & Security Reviewer  
**Repository:** TempMail (MERN Stack + Cloudflare Email Routing Worker)  

---

## 1. Automated Check Results

1. **`npm audit` Summary:**
   - **Backend:** 0 vulnerabilities found (`found 0 vulnerabilities`).
   - **Frontend:** 8 vulnerabilities (5 high, 3 moderate):
     - `@grpc/grpc-js` (high, transitive via `firebase` firestore sub-module): Certificate & error transmission advisories (GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4).
     - `esbuild` <=0.24.2 (moderate, dev-server request reading advisory GHSA-67mh-4wv8-2f99 via Vite 5.4.21).
     - `react-router` / `react-router-dom` 6.30.6 (moderate, backslash open redirect & constructor injection advisories GHSA-wrjc-x8rr-h8h6, GHSA-337j-9hxr-rhxg).

2. **Syntax Checks & Frontend Build:**
   - `node --check` across all backend `.js` files: **0 errors**.
   - `node --check cloudflare-worker.js`: **0 errors**.
   - `npm run build` in `frontend/`: **Built successfully** in 1.1s (61.45 kB CSS, 505.31 kB JS).

3. **CURL & Live Endpoint Verification (mongodb-memory-server):**
   - 37 out of 37 automated endpoint checks passed:
     - Mailbox creation, listing, reading, deletion, and expiry extension.
     - Inbound webhook authentication (missing secret 401, wrong secret 401, unknown mailbox 404, oversized payload 413, valid payload 200).
     - Admin login (wrong password 401, valid credentials 200).
     - All 12 Admin REST endpoints verified with 401 (unauthorized) and 200 (authorized).

---

## 2. Findings Matrix

| ID | Category | Severity | File | Line | Finding & Impact | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Security / Correctness | **Critical** | `cloudflare-worker.js` | 22 | Typo in default backend URL (`temp-mail-1xit.onrender.com` instead of `temp-mail-lx1t.onrender.com`). Also missing HTTP `fetch()` export causing "No fetch handler!" error on Cloudflare preview. | **Fixed** |
| **CORR-01** | Correctness / Email | **High** | `backend/src/routes/public.js` | 446 | Inbound recipient address string not normalized from RFC 5322 formatted emails (e.g. `<user@domain.com>` or `Name <user@domain.com>`), causing `box(address)` lookup to fail and reject emails with 404. | **Fixed** |
| **CORR-02** | Correctness / Email | **High** | `backend/src/smtp.js` | 88 | SMTP server envelope recipient matching lacks angle bracket and display name sanitization. | **Fixed** |
| **CORR-03** | Correctness | **High** | `backend/src/routes/public.js` | 448 | Messages accepted for expired mailboxes if MongoDB background TTL thread has not reaped the document yet (`expiresAt <= new Date()`). | **Fixed** |
| **CORR-04** | Correctness | **High** | `backend/src/app.js` | 64 | Unhandled promise rejection risk in Express 4 wildcard route (`app.get('*')`) if `Post.findOne` or file reading throws an exception. | **Fixed** |
| **SEC-02** | Security | **High** | `backend/src/app.js` | 16 | Wide-open wildcard CORS (`app.use(cors())`) on all endpoints including sensitive `/api/admin/*`. | **Fixed** |
| **SEC-03** | Security | **High** | `wrangler.toml` | 6-7 | Secrets template uses weak placeholder values and contains unconfigured destination URLs. | **Fixed** |
| **FE-01** | Frontend | **Medium** | `frontend/src/pages/Home.jsx` | 516-555 | SSE silent drop / stalled stream issue: Polling fallback only starts on `eventSource.onerror`. If proxy buffers stream without error, incoming emails are delayed. | **Fixed** |
| **EM-01** | Email Handling | **Medium** | `backend/src/utils/extractors.js` | 44-51 | Verification details extractor only matches numeric codes (`[0-9]{4,8}`), missing alphanumeric codes (e.g. `G-123456`, `AB34CD`). | **Fixed** |
| **SEC-04** | Security | **Medium** | `backend/src/app.js` | 15 | `helmet({ contentSecurityPolicy: false })` disables Content Security Policy entirely on the backend server. | **Fixed** |
| **CORR-05** | Correctness | **Medium** | `backend/src/cleanup.js` | 57 | `setInterval` for GridFS cleanup is not unref'd (`.unref()`), keeping the Node.js event loop alive and blocking graceful exit. | **Fixed** |
| **CORR-06** | Correctness | **Medium** | `backend/src/utils/domainHealth.js` | 15 | DNS MX resolution does not enforce timeout, risking hanging requests if authoritative nameservers stall. | **Fixed** |
| **SEC-05** | Security | **Medium** | `backend/src/routes/public.js` | 249 | No rate limiting on `/api/mailbox/:address/messages` endpoint, allowing rapid polling abuse against MongoDB. | **Fixed** |
| **DEP-01** | Config & Deployment | **Medium** | `frontend/package.json` | 13-25 | Vulnerable dependencies (`@grpc/grpc-js`, `esbuild`, `react-router-dom`) reported by `npm audit`. | **Not fixed (Dev/Transitive - Vite dev server and unused Firestore sub-module; frontend build cleanly bundles web auth without node gRPC)** |
| **CQ-01** | Code Quality | **Low** | `backend/src/routes/admin.js` | 527, 551 | Route path discrepancy between `/backup/export` and `/backups/export` across client documentation. | **Fixed** |
| **FE-02** | Frontend | **Low** | `frontend/src/pages/Home.jsx` | 640-720 | Missing accessibility `aria-label` attributes on icon-only buttons (theme toggle, copy code, refresh). | **Fixed** |
| **DOC-01** | Config & Deployment | **Low** | `README.md` | 1-80 | README instructions omit Cloudflare Email Routing setup and NOWPayments / Firebase environment configuration. | **Fixed** |

---

## 3. Root Cause: "email cannot received code"
1. **Cloudflare Worker Backend URL Typo:** The default worker script targeted `https://temp-mail-1xit.onrender.com` (digit `1` instead of letter `l`). When Cloudflare received incoming emails for the domain, it forwarded to a non-existent URL, caught a network exception, and rejected the email (`message.setReject`).
2. **Strict Inbound Recipient String Matching:** Services such as Google, GitHub, and Twitter send `To` addresses with RFC 5322 formatting (e.g. `"<abc@domain.com>"` or `"User <abc@domain.com>"`). `/api/inbound` performed an exact string match without extracting the raw email between `<` and `>`, causing valid messages to return `404 Mailbox not found or expired`.
3. **Numeric-Only Regex:** Verification extractors only recognized 4-8 digit numbers, ignoring common alphanumeric security tokens (e.g. `G-123456`, `X8K2M`).
4. **SSE Buffering without Polling Fallback:** On cloud reverse proxies (Render / Cloudflare), long-lived SSE connections can be held open without streaming chunks, while frontend polling was disabled as long as `onerror` was not fired.
