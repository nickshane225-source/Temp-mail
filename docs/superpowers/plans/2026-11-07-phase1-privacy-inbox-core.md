# Phase 1: Core Privacy & Inbox Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 5 core privacy and inbox utilities: Instant Burn button, inline image/PDF previews, `.eml` zip export, password-protected inboxes, and phishing lookalike domain detection.

**Architecture:** 
- Backend: Extend `Mailbox` schema with `passwordHash` and `isLocked`; implement `/burn`, `/lock`, `/unlock`, and `/export` routes in `routes/public.js`; implement zero-dependency RFC-compliant zip bundler in `utils/zip.js`; implement phishing lookalike and brand impersonation detector in `utils/spamScore.js`.
- Frontend: Enhance `Home.jsx` with instant burn action and state reset, inline image viewer and PDF preview toggle, zip download trigger, lock/unlock PIN modal, and prominent phishing warning alert banner.

**Tech Stack:** Express, Node.js (Crypto, Zlib), MongoDB/Mongoose, React, Tailwind CSS, Supertest + Vitest.

---

### Global Constraints
- Keep dependencies minimal. Use Node.js built-in `zlib` and `crypto` for ZIP packaging and token hashing.
- Maintain existing token authentication (`x-mailbox-token`) and role authorization.
- Zero breaking changes to existing mailbox polling, SSE streams, or admin dashboards.

---

## File Structure

- **Created Files:**
  - `backend/src/utils/zip.js`: Pure Node.js streaming/buffer ZIP archive generator using `zlib.deflateRawSync`.
  - `backend/tests/phase1-privacy-inbox.test.js`: Comprehensive integration test suite for all Phase 1 features.
- **Modified Files:**
  - `backend/src/models.js`: Add `passwordHash` and `isLocked` fields to `Mailbox` schema; add `phishingWarning` to `Message` schema.
  - `backend/src/utils/spamScore.js`: Add brand lookalike domain and display name mismatch heuristics.
  - `backend/src/routes/public.js`: Add `/mailbox/:address/burn`, `/mailbox/:address/export`, `/mailbox/:address/lock`, `/mailbox/:address/unlock`, and enforce lock check on message retrieval.
  - `frontend/src/pages/Home.jsx`: Add Burn button, inline image/PDF previewer, ZIP export button, PIN lock/unlock modal, and phishing alert banner.

---

## Tasks

### Task 1: Zero-Dependency ZIP Archive Utility (`backend/src/utils/zip.js`)
- [ ] Implement `createZipArchive(files)` supporting standard PK ZIP format with CRC32 and DEFLATE compression.
- [ ] Add unit test proving valid ZIP buffer output unpackable by standard unzip tools.

### Task 2: Instant Mailbox Burn Feature
- [ ] Add `POST /api/mailbox/:address/burn` in `routes/public.js`: deletes mailbox, all messages, and GridFS attachments immediately.
- [ ] Add "🔥 Burn Inbox" button in `frontend/src/pages/Home.jsx` with confirmation modal and local storage cleanup.
- [ ] Add automated test for `/burn` route.

### Task 3: Export Inbox as ZIP of `.eml` Files
- [ ] Add `GET /api/mailbox/:address/export` in `routes/public.js` generating standard RFC 822 `.eml` files in a ZIP.
- [ ] Add "📦 Export .EML (ZIP)" button in `frontend/src/pages/Home.jsx` with browser blob download.
- [ ] Add automated test verifying `.eml` zip export.

### Task 4: Password-Protected Inboxes (PIN / Password Lock)
- [ ] Update `Mailbox` schema in `models.js` with `passwordHash` and `isLocked`.
- [ ] Add `POST /api/mailbox/:address/lock` and `POST /api/mailbox/:address/unlock` in `routes/public.js`.
- [ ] Enforce password protection on `GET /api/mailbox/:address/messages` when locked.
- [ ] Add lock/unlock UI dialog in `frontend/src/pages/Home.jsx`.
- [ ] Add automated test verifying lock, incorrect password rejection, and unlock.

### Task 5: Phishing Lookalike Detection & Warning Banner
- [ ] Extend `calculateSpamScore` in `backend/src/utils/spamScore.js` to detect lookalike domains and display name spoofing.
- [ ] Store `phishingWarning` on `Message`.
- [ ] Render a warning banner in `frontend/src/pages/Home.jsx` when viewing flagged emails.
- [ ] Add automated test verifying lookalike detection (e.g. `support@paypa1.com` spoofing "PayPal").

### Task 6: Inline Attachment Previews
- [ ] Update `Home.jsx` message view to render inline thumbnails/previews for images (`image/*`) and embedded PDF viewer for `application/pdf`.
- [ ] Preserve full download button for all attachment types.

### Task 7: Full Test Suite & Build Verification
- [ ] Run `backend/tests/phase1-privacy-inbox.test.js` and `npm test`.
- [ ] Run `node --check` across backend files.
- [ ] Run `npm run build` in `frontend/`.
- [ ] Commit and push changes.
