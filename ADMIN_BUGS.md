# Admin Dashboard Audit & Bug Report

**Date:** 2026-11-06  
**Auditor:** Senior Full-Stack Engineer  
**Scope:** Admin Dashboard (`/admin`), backend API (`/api/admin/*`), and responsive mobile layout.

---

## 1. Bugs Matrix

| ID | Component | Severity | Description & Impact | Expected vs Actual | Root Cause | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BUG-01** | `Admin.jsx` (Backups) | **High** | Backup export fails with 401 Unauthorized | **Expected:** Clicking "Download Backup JSON" downloads `.json` file.<br>**Actual:** Opens new tab with HTTP 401 error. | `window.open()` executes unauthenticated GET request without `Authorization: Bearer` header. Fixed via authenticated fetch blob stream download. | **Fixed** |
| **BUG-02** | `admin.js` (Domains) | **High** | Pausing or deleting the only active domain breaks public site | **Expected:** Admin receives error preventing pausing/deleting the only active domain.<br>**Actual:** Deletion/pause succeeds, causing all public mailbox endpoints to return 503. | Missing count validation `Domain.countDocuments({ active: true, _id: { $ne: id } })` in `PATCH /domains/:id` and `DELETE /domains/:id`. Added guard returning 400. | **Fixed** |
| **BUG-03** | `Admin.jsx` (Messages) | **Medium** | Long subjects and addresses cause table blowout | **Expected:** Long text is truncated with ellipsis and title tooltip.<br>**Actual:** Table stretches horizontally beyond viewport, breaking layout. | Table cells lacked max-width, text-overflow: ellipsis, and whitespace constraints. Added inline truncation styles and title tooltips. | **Fixed** |
| **BUG-04** | `Admin.jsx` (Messages) | **Medium** | Single message deletion lacks confirmation | **Expected:** User is prompted to confirm before permanent deletion.<br>**Actual:** Message is deleted immediately on click. | `del(id)` called DELETE endpoint immediately without `confirm()` dialog. Added confirmation prompt and per-item deleting state. | **Fixed** |
| **BUG-05** | `Admin.jsx` (Settings) | **Medium** | Number inputs sent as strings & unstyled error/success feedback | **Expected:** Numbers parsed as integers, double-clicks prevented during save, and errors styled in red, success in green.<br>**Actual:** Values sent as strings, multiple submits allowed, and messages render as plain unstyled text. | `input` passes `e.target.value` (string); `msg` was stored as plain string. Added explicit `Number()` coercion, `saving` lock, and ok/danger pill styling. | **Fixed** |
| **BUG-06** | `styles.css` / `Admin.jsx` | **Medium** | Mobile layout (375px) navigation bloat and fixed grid overflow | **Expected:** Navigation scrolls as compact horizontal bar; form controls stack cleanly.<br>**Actual:** 13 tabs wrap into a massive block taking up vertical screen; fixed 4-column grids overflow screen. | `.admin nav` used `flex-wrap: wrap` without horizontal scroll; inline grid templates used fixed 4-column layouts. Switched nav to horizontal scroll container and responsive grids. | **Fixed** |
| **BUG-07** | `Admin.jsx` (AdminAccounts, Blog, Domains, Abuse) | **Medium** | Unhandled promise rejection in admin forms | **Expected:** Inline error message displayed when submission fails (e.g. duplicate admin, short password).<br>**Actual:** Console logs uncaught promise rejection; form gives no user feedback. | Handlers lacked `try/catch` block and error state. Added try/catch and dedicated error banners across forms. | **Fixed** |

---

## 2. How I Tested

### A. Automated Backend Integration Suite (`vitest`)
Ran `npm test` in `backend/` using `vitest run` against an in-memory MongoDB server (`mongodb-memory-server`):
- **36 / 36 tests passed** (10.57s duration)
- Covered user registration, bcrypt auth, JWT token validation, 2FA TOTP & backup codes, role-based authorization (owner vs moderator), rate limiting, DNS health checks, NOWPayments crypto webhooks, and cleanup jobs.

### B. Admin Dashboard Audit Suite (`backend/tests/admin-audit-runner.js`)
Executed end-to-end admin lifecycle audit across 26 discrete assertions:
1. **Authentication:**
   - Wrong password -> 401
   - Empty credentials -> 401
   - Correct credentials -> 200 + valid 12-hour JWT
   - Profile retrieval (`/api/admin/me`) -> 200
   - Expired/tampered JWT -> 401
2. **Overview & Metrics:**
   - 7-day stats time-series array -> 200
   - Mailbox creation & inbound SMTP message ingestion updates counters dynamically
3. **Messages Management:**
   - Message list pagination & sorting -> 200
   - Single message deletion -> 200
   - Global purge of mailboxes & messages -> 200
4. **Domains Management & Guards:**
   - Add valid domain -> 200
   - Add invalid domain -> 400
   - Add duplicate domain -> 409
   - Pause domain -> active: false (verified excluded from `/api/domains`)
   - Activate domain -> active: true
   - Remove non-essential domain -> 200
   - **Guard verification:** Attempting to pause the only remaining active domain -> 400
   - **Guard verification:** Attempting to delete the only remaining active domain -> 400
5. **Backups Security:**
   - Unauthenticated backup export -> 401
   - Authenticated backup export -> 200 JSON bundle
6. **Settings Persistence & Validation:**
   - Load default settings -> 200
   - Save valid settings (ttlMinutes = 45) -> 200
   - Verify newly generated mailboxes inherit updated TTL (2700s) -> 200
   - Invalid numeric parameters (`ttlMinutes < 5`, `maxMessageKB < 64`) rejected -> 400

**Result:** **26 / 26 passed** (0 failures).

### C. Syntax & Compilation Checks
- **Backend syntax check:** Executed `node --check` across all 19 JavaScript source files in `backend/src/` -> **0 errors**.
- **Frontend production build:** Executed `npm run build` in `frontend/` with Vite v5.4.21 -> **Build succeeded with 0 errors** in 1.03s.
