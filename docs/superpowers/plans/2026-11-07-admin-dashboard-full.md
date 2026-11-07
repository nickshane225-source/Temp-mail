# Comprehensive Admin Dashboard Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the TempMail admin dashboard into an enterprise administration hub with comprehensive User lifecycle management, dedicated Payments & Webhook audit, flexible Analytics, Spam review & bulk message control, DNS helpers, Abuse automation, fine-grained Role-Based Access Control, System Health monitoring, and a modular frontend architecture.

**Architecture:** 
- Backend: Extend MongoDB schemas (`Payment`, `WebhookLog`, `User`, `Setting`, `Blocklist`, `Admin`); expand `backend/src/routes/admin.js` with paginated search, CSV exports, suspension & token revocation, payment reconciliation, and system health checks.
- Frontend: Refactor the monolithic ~1,600-line `Admin.jsx` into modular components under `frontend/src/components/admin/` (`OverviewTab`, `UsersTab`, `PaymentsTab`, `MessagesTab`, `DomainsTab`, `AbuseTab`, `AdminsTab`, `AuditTab`, `SettingsTab`, `BlogTab`, `UserDetailDrawer`, `GlobalSearchModal`) with keyboard navigation (`1-9`, `Ctrl+K`), dark mode, and loading skeletons.

**Tech Stack:** Express 4, MongoDB/Mongoose 8, Node.js Crypto/Streams, React 18, Vite, Tailwind CSS, Supertest + Vitest.

**Spec:** User requirements for Admin Dashboard upgrade covering Users, Payments, Analytics, Messages, Domains, Abuse, Security, Monitoring, Settings, Blog, and Dashboard Architecture.

## Global Constraints
- Do not introduce breaking changes to existing admin routes (`/stats`, `/domains`, `/messages`, `/backup/export`, `/cleanup`).
- All email bodies remain strictly hidden in admin message views to preserve user privacy (metadata only).
- Keep dependencies minimal; use Node.js built-in streaming/crypto for CSV generation and token validation.
- All admin endpoints require authentication; mutation endpoints respect fine-grained roles (`owner`, `moderator`, `billing_only`, `read_only`).

## Review Focus
1. **Token revocation on suspension:** When a user is suspended or banned via the admin panel, their existing JWTs must be rejected immediately on subsequent requests.
2. **Payment reconciliation idempotency:** Triggering manual reconcile on an existing payment must not grant duplicate premium days.
3. **Pagination boundaries:** Requesting out-of-range pages or invalid limits (e.g. `page=-1` or `limit=1000`) must default gracefully without crashing the server.
4. **Role enforcement:** A user with role `read_only` must be barred from `POST`, `PUT`, `PATCH`, and `DELETE` actions with HTTP 403.
5. **Bulk message deletion safety:** Bulk message deletion must also clean up associated GridFS attachment chunks without orphaned files.

---

## File Structure

- **Created Backend Files:**
  - `backend/tests/admin-users-payments.test.js`: Integration tests for users management, payment ledger, and webhooks audit.
  - `backend/tests/admin-security-settings.test.js`: Integration tests for roles, active sessions, and health checks.
- **Modified Backend Files:**
  - `backend/src/models.js`: Add `Payment` and `WebhookLog` schemas; extend `User`, `Admin`, `Setting`, and `Blocklist` schemas.
  - `backend/src/routes/admin.js`: Implement paginated users API, user drawer details, suspension, key revocation, payments ledger, webhook logs, health check, and bulk delete.
  - `backend/src/routes/user.js`: Record incoming payment transactions and log webhooks into `Payment` and `WebhookLog`.
  - `backend/tests/admin-audit-runner.js`: Expand automated standalone audit runner to cover new endpoints.
- **Created Frontend Files:**
  - `frontend/src/components/admin/AdminLayout.jsx`: Shell with sidebar, global search modal, dark mode, keyboard shortcuts.
  - `frontend/src/components/admin/OverviewTab.jsx`: Date range selector, comparative metrics, live message metadata feed.
  - `frontend/src/components/admin/UsersTab.jsx`: Paginated table, filters, sort, CSV export, suspension buttons.
  - `frontend/src/components/admin/UserDetailDrawer.jsx`: Slide-over drawer with user stats, keys, and payment history.
  - `frontend/src/components/admin/PaymentsTab.jsx`: MRR / conversion cards, transaction list, webhook audit, reconcile modal.
  - `frontend/src/components/admin/MessagesTab.jsx`: Bulk delete checkboxes, spam queue, filters.
  - `frontend/src/components/admin/DomainsTab.jsx`: DNS helper table with copy buttons, bulk domain add.
  - `frontend/src/components/admin/AbuseTab.jsx`: Grouped reports, wildcard blocklist manager with CSV import/export.
  - `frontend/src/components/admin/AdminsTab.jsx`: Active sessions, role assignment, login history.
  - `frontend/src/components/admin/AuditTab.jsx`: Audit logs with filter and CSV export.
  - `frontend/src/components/admin/SettingsTab.jsx`: Maintenance mode, feature flags, announcement editor.
  - `frontend/src/components/admin/BlogTab.jsx`: Markdown preview, SEO preview, draft/publish workflow.
- **Modified Frontend Files:**
  - `frontend/src/pages/Admin.jsx`: Master admin controller refactored to orchestrate modular tab components.

---

## Tasks

### Task 1: Backend Data Models & Persistence Scaffolding
**Files:**
- Modify: `backend/src/models.js`
- Test: `backend/tests/admin-users-payments.test.js`

**Interfaces:**
- Consumes: Mongoose schema definitions in `backend/src/models.js`.
- Produces: Exported models `Payment`, `WebhookLog`, and updated fields on `User`, `Setting`, `Admin`, `Blocklist`.

- [ ] **Step 1: Write the failing test for new models in `backend/tests/admin-users-payments.test.js`**
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run tests/admin-users-payments.test.js`
- [ ] **Step 3: Define `Payment` and `WebhookLog` schemas and extend `User`, `Setting`, `Blocklist`, and `Admin` in `backend/src/models.js`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit changes**
  `git commit -m "feat(models): add Payment, WebhookLog schemas and extend User, Admin, Setting"`

---

### Task 2: Backend Users Management API
**Files:**
- Modify: `backend/src/routes/admin.js`
- Modify: `backend/src/routes/user.js`
- Test: `backend/tests/admin-users-payments.test.js`

**Interfaces:**
- Consumes: `User`, `Mailbox`, `Payment` models.
- Produces: `GET /api/admin/users`, `GET /api/admin/users/:id`, `POST /api/admin/users/:id/suspend`, `POST /api/admin/users/:id/reactivate`, `DELETE /api/admin/users/:id/api-keys/:keyId`, `POST /api/admin/users/:id/grant-custom-premium`, `GET /api/admin/users/export`.

- [ ] **Step 1: Write failing tests for user search, pagination, suspension, and CSV export**
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run tests/admin-users-payments.test.js`
- [ ] **Step 3: Implement paginated `/users` with search, filter, detail drawer endpoint, suspension with token revocation, and CSV streaming in `backend/src/routes/admin.js`**
- [ ] **Step 4: Enforce `tokenRevokedAt` check in `backend/src/routes/user.js` user authentication middleware**
- [ ] **Step 5: Run tests to verify they pass**
- [ ] **Step 6: Commit changes**
  `git commit -m "feat(admin-users): add paginated user search, detail drawer, suspension, and CSV export"`

---

### Task 3: Backend Payments Ledger, Webhook Audit & Reconciliation API
**Files:**
- Modify: `backend/src/routes/admin.js`
- Modify: `backend/src/routes/user.js`
- Test: `backend/tests/admin-users-payments.test.js`

**Interfaces:**
- Consumes: `Payment`, `WebhookLog`, `User` models.
- Produces: `GET /api/admin/payments`, `GET /api/admin/payments/stats`, `GET /api/admin/payments/webhooks`, `POST /api/admin/payments/reconcile`.

- [ ] **Step 1: Write failing tests for payments list, revenue stats, webhook logging, and reconciliation**
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run tests/admin-users-payments.test.js`
- [ ] **Step 3: Record payments and webhook calls in `routes/user.js` (NOWPayments & Stripe webhooks)**
- [ ] **Step 4: Implement `/payments`, `/payments/stats`, `/payments/webhooks`, and `/payments/reconcile` in `routes/admin.js`**
- [ ] **Step 5: Run tests to verify they pass**
- [ ] **Step 6: Commit changes**
  `git commit -m "feat(admin-payments): add payment ledger, webhook audits, revenue stats, and manual reconcile"`

---

### Task 4: Backend Analytics, System Health & Live Message Stream API
**Files:**
- Modify: `backend/src/routes/admin.js`
- Test: `backend/tests/admin-security-settings.test.js`

**Interfaces:**
- Consumes: `Stat`, `Message`, `Mailbox`, `User` models.
- Produces: `GET /api/admin/analytics/range`, `GET /api/admin/health`, `GET /api/admin/messages/stream`.

- [ ] **Step 1: Write failing tests for date range analytics, system health, and message stream**
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run tests/admin-security-settings.test.js`
- [ ] **Step 3: Implement `/analytics/range` with period comparison and top senders/mailboxes**
- [ ] **Step 4: Implement `/health` checking MongoDB status, SMTP status, and error counts**
- [ ] **Step 5: Implement `/messages/stream` SSE live metadata feed**
- [ ] **Step 6: Run tests to verify they pass**
- [ ] **Step 7: Commit changes**
  `git commit -m "feat(admin-analytics): add comparative analytics, health check, and live message stream"`

---

### Task 5: Backend Messages Bulk Actions, Spam Queue & Abuse Automation
**Files:**
- Modify: `backend/src/routes/admin.js`
- Test: `backend/tests/admin-security-settings.test.js`

**Interfaces:**
- Consumes: `Message`, `Report`, `Blocklist` models.
- Produces: `POST /api/admin/messages/bulk-delete`, `GET /api/admin/spam-queue`, `POST /api/admin/blocklist/bulk`, `GET /api/admin/blocklist/export`, `GET /api/admin/reports/grouped`.

- [ ] **Step 1: Write failing tests for bulk message deletion, spam queue, and blocklist import/export**
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run tests/admin-security-settings.test.js`
- [ ] **Step 3: Implement `bulk-delete` with GridFS attachment cleanup in `routes/admin.js`**
- [ ] **Step 4: Implement `spam-queue` and grouped reports endpoint**
- [ ] **Step 5: Implement wildcard/pattern blocklist matching with hit counters and CSV import/export**
- [ ] **Step 6: Run tests to verify they pass**
- [ ] **Step 7: Commit changes**
  `git commit -m "feat(admin-abuse): add bulk deletion, spam queue, grouped reports, and wildcard blocklist"`

---

### Task 6: Backend Roles, Active Sessions, and Settings Controls
**Files:**
- Modify: `backend/src/routes/admin.js`
- Modify: `backend/src/app.js`
- Test: `backend/tests/admin-security-settings.test.js`

**Interfaces:**
- Consumes: `Admin`, `Setting` models.
- Produces: Role enforcement middleware, `POST /api/admin/logout-all`, maintenance mode and feature flag controls.

- [ ] **Step 1: Write failing tests for role permissions (`read_only` vs `billing_only` vs `owner`) and maintenance mode**
- [ ] **Step 2: Run test to verify it fails**
  Run: `npx vitest run tests/admin-security-settings.test.js`
- [ ] **Step 3: Add `requireRole` middleware and `POST /logout-all` session revocation in `routes/admin.js`**
- [ ] **Step 4: Implement maintenance mode check in `app.js` and settings feature flag toggles**
- [ ] **Step 5: Run tests to verify they pass**
- [ ] **Step 6: Commit changes**
  `git commit -m "feat(admin-security): add fine-grained roles, session revocation, and maintenance mode"`

---

### Task 7: Frontend Architecture Refactoring & Admin Shell
**Files:**
- Create: `frontend/src/components/admin/AdminLayout.jsx`
- Modify: `frontend/src/pages/Admin.jsx`

**Interfaces:**
- Consumes: Admin session state from `Admin.jsx`.
- Produces: Modular admin shell with dark mode, keyboard navigation shortcuts, global search modal, and breadcrumbs.

- [ ] **Step 1: Create `AdminLayout.jsx` with responsive sidebar, tab switching shortcuts (keys 1-9, Ctrl+K), and dark theme switcher**
- [ ] **Step 2: Refactor `Admin.jsx` into the master state container that dynamically mounts active tabs**
- [ ] **Step 3: Test navigation and hotkeys in the browser**
- [ ] **Step 4: Commit changes**
  `git commit -m "refactor(admin): split Admin.jsx into modular layout architecture with keyboard shortcuts"`

---

### Task 8: Frontend Users Tab & User Detail Drawer
**Files:**
- Create: `frontend/src/components/admin/UsersTab.jsx`
- Create: `frontend/src/components/admin/UserDetailDrawer.jsx`
- Modify: `frontend/src/pages/Admin.jsx`

**Interfaces:**
- Consumes: `/api/admin/users*` endpoints.
- Produces: Interactive users table, filter drawer, custom days grant modal, API key revocation, and CSV export.

- [ ] **Step 1: Build `UsersTab.jsx` with search bar, status filter pills, pagination controls, and CSV export button**
- [ ] **Step 2: Build `UserDetailDrawer.jsx` slide-over view displaying user profile, API keys with last-used time, payment history, and assigned mailboxes**
- [ ] **Step 3: Wire suspension, reactivation, and custom premium grant dialogs**
- [ ] **Step 4: Verify in browser and test suite**
- [ ] **Step 5: Commit changes**
  `git commit -m "feat(ui-users): implement UsersTab with paginated search, detail drawer, and suspension controls"`

---

### Task 9: Frontend Payments Tab & Revenue Intelligence
**Files:**
- Create: `frontend/src/components/admin/PaymentsTab.jsx`
- Modify: `frontend/src/pages/Admin.jsx`

**Interfaces:**
- Consumes: `/api/admin/payments*` endpoints.
- Produces: Revenue stat cards, transactions list, webhook audit log viewer, and manual payment reconciliation modal.

- [ ] **Step 1: Build `PaymentsTab.jsx` with MRR, new subscribers this week, 7-day expiring count, and conversion rate cards**
- [ ] **Step 2: Implement transactions list with provider badges (Stripe / NOWPayments) and order search**
- [ ] **Step 3: Implement Webhook Logs sub-view highlighting duplicate/rejected callbacks**
- [ ] **Step 4: Implement manual payment reconcile modal**
- [ ] **Step 5: Commit changes**
  `git commit -m "feat(ui-payments): implement PaymentsTab with revenue metrics, webhook logs, and reconcile modal"`

---

### Task 10: Frontend Overview, Messages, Domains, Abuse, Settings & Blog Tabs
**Files:**
- Create: `frontend/src/components/admin/OverviewTab.jsx`
- Create: `frontend/src/components/admin/MessagesTab.jsx`
- Create: `frontend/src/components/admin/DomainsTab.jsx`
- Create: `frontend/src/components/admin/AbuseTab.jsx`
- Create: `frontend/src/components/admin/AdminsTab.jsx`
- Create: `frontend/src/components/admin/AuditTab.jsx`
- Create: `frontend/src/components/admin/SettingsTab.jsx`
- Create: `frontend/src/components/admin/BlogTab.jsx`
- Modify: `frontend/src/pages/Admin.jsx`

**Interfaces:**
- Consumes: Admin backend endpoints for stats, messages, domains, abuse, settings, and blog.
- Produces: Complete modular tab components for all dashboard sections.

- [ ] **Step 1: Implement `OverviewTab.jsx` with date range picker, comparison cards, and live message ticker**
- [ ] **Step 2: Implement `MessagesTab.jsx` with multi-select checkboxes for bulk deletion, domain filters, and Spam Review Queue**
- [ ] **Step 3: Implement `DomainsTab.jsx` with DNS configuration guide (one-click copy for MX/SPF) and bulk domain onboarding**
- [ ] **Step 4: Implement `AbuseTab.jsx` with sender report grouping, wildcard pattern blocklist, and hit counts**
- [ ] **Step 5: Implement `SettingsTab.jsx` with maintenance mode switch, feature flags, and announcement banner editor**
- [ ] **Step 6: Implement `BlogTab.jsx`, `AdminsTab.jsx`, and `AuditTab.jsx` with CSV export**
- [ ] **Step 7: Verify all tabs mount and function cleanly**
- [ ] **Step 8: Commit changes**
  `git commit -m "feat(ui-admin-tabs): complete modular tabs for overview, messages, domains, abuse, and settings"`

---

### Task 11: End-to-End Verification, Audit Suite & Build
**Files:**
- Modify: `backend/tests/admin-audit-runner.js`
- Test: All backend and frontend tests

**Interfaces:**
- Consumes: All updated endpoints and components.
- Produces: Complete test report confirming 100% pass across all functions.

- [ ] **Step 1: Update `backend/tests/admin-audit-runner.js` with automated assertions for all new endpoints**
- [ ] **Step 2: Run `node tests/admin-audit-runner.js` and verify all tests pass**
- [ ] **Step 3: Run `npx vitest run` across all backend test files**
- [ ] **Step 4: Run `node --check` across all backend JavaScript files**
- [ ] **Step 5: Run `npm run build` in `frontend/` to confirm production bundle builds without errors**
- [ ] **Step 6: Push branch to `origin main`**
- [ ] **Step 7: Provide final summary report to user**
