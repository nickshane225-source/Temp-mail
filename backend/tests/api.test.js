import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { Domain, Mailbox, Message, Admin, Setting, User, Post, Blocklist, Report, AuditLog, Failure, getSettings } from '../src/models.js';
import { generateSync } from 'otplib';
import { analyzeLinkSafety, rewriteHtmlLinks } from '../../frontend/src/utils/linkSafety.js';

let mongoServer;
const TEST_JWT_SECRET = 'super_secure_jwt_secret_for_testing_purposes_only_32chars';
const TEST_INBOUND_SECRET = 'test_inbound_secret_48_chars_long_key_value_here_12345';

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  process.env.INBOUND_SECRET = TEST_INBOUND_SECRET;

  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await Domain.deleteMany({});
  await Mailbox.deleteMany({});
  await Message.deleteMany({});
  await Admin.deleteMany({});
  await Setting.deleteMany({});
  await User.deleteMany({});
  await Post.deleteMany({});
  await Blocklist.deleteMany({});
  await Report.deleteMany({});
  await AuditLog.deleteMany({});
  await Failure.deleteMany({});

  // Seed default active domain for tests
  await Domain.create({ name: 'example.com', active: true });
});

describe('Phase 1 Security & Core Tests', () => {
  describe('Mailbox Creation & Private Tokens', () => {
    it('creates a mailbox and returns address, expiresAt, ttlSeconds, and private token', async () => {
      const res = await request(app)
        .post('/api/mailbox')
        .send({ domain: 'example.com' });

      expect(res.status).toBe(200);
      expect(res.body.address).toMatch(/^[a-f0-9]+@example\.com$/);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe('string');
      expect(res.body.token.length).toBe(48); // 24 bytes hex = 48 chars
      expect(res.body.ttlSeconds).toBe(1800); // 30 min default
      expect(res.body.expiresAt).toBeDefined();

      // Ensure only SHA-256 hash is saved in DB, never raw token
      const stored = await Mailbox.findOne({ address: res.body.address });
      expect(stored).toBeDefined();
      expect(stored.tokenHash).toBeDefined();
      const expectedHash = crypto.createHash('sha256').update(res.body.token).digest('hex');
      expect(stored.tokenHash).toBe(expectedHash);
    });

    it('requires x-mailbox-token to view messages (401 without or with wrong token)', async () => {
      const created = await request(app).post('/api/mailbox').send();
      const address = created.body.address;
      const validToken = created.body.token;

      // Without token
      const resNoToken = await request(app).get(`/api/mailbox/${address}/messages`);
      expect(resNoToken.status).toBe(401);
      expect(resNoToken.body.error).toMatch(/token/i);

      // With wrong token
      const resWrongToken = await request(app)
        .get(`/api/mailbox/${address}/messages`)
        .set('x-mailbox-token', 'wrong_fake_token_value');
      expect(resWrongToken.status).toBe(401);

      // With correct token
      const resValid = await request(app)
        .get(`/api/mailbox/${address}/messages`)
        .set('x-mailbox-token', validToken);
      expect(resValid.status).toBe(200);
      expect(Array.isArray(resValid.body.messages)).toBe(true);
    });

    it('requires x-mailbox-token to extend mailbox lifetime', async () => {
      const created = await request(app).post('/api/mailbox').send();
      const address = created.body.address;
      const validToken = created.body.token;

      // Without token
      const resNoToken = await request(app).post(`/api/mailbox/${address}/extend`);
      expect(resNoToken.status).toBe(401);

      // With valid token
      const resValid = await request(app)
        .post(`/api/mailbox/${address}/extend`)
        .set('x-mailbox-token', validToken);
      expect(resValid.status).toBe(200);
      expect(resValid.body.address).toBe(address);
      expect(resValid.body.expiresAt).toBeDefined();
    });

    it('requires x-mailbox-token to read or delete a specific message', async () => {
      const created = await request(app).post('/api/mailbox').send();
      const address = created.body.address;
      const validToken = created.body.token;

      // Create a test message in the mailbox
      const msg = await Message.create({
        address,
        from: 'sender@example.com',
        subject: 'Hello',
        text: 'Test body',
        expiresAt: new Date(Date.now() + 60000),
      });

      // Read message - wrong token
      const resReadWrong = await request(app)
        .get(`/api/mailbox/${address}/messages/${msg._id}`)
        .set('x-mailbox-token', 'invalid_token');
      expect(resReadWrong.status).toBe(401);

      // Read message - valid token
      const resReadValid = await request(app)
        .get(`/api/mailbox/${address}/messages/${msg._id}`)
        .set('x-mailbox-token', validToken);
      expect(resReadValid.status).toBe(200);
      expect(resReadValid.body.subject).toBe('Hello');

      // Delete message - wrong token
      const resDelWrong = await request(app)
        .delete(`/api/mailbox/${address}/messages/${msg._id}`)
        .set('x-mailbox-token', 'invalid_token');
      expect(resDelWrong.status).toBe(401);

      // Delete message - valid token
      const resDelValid = await request(app)
        .delete(`/api/mailbox/${address}/messages/${msg._id}`)
        .set('x-mailbox-token', validToken);
      expect(resDelValid.status).toBe(200);

      const found = await Message.findById(msg._id);
      expect(found).toBeNull();
    });
  });

  describe('Inbound Webhook (/api/inbound)', () => {
    it('accepts valid email with correct x-inbound-secret for existing mailbox', async () => {
      const created = await request(app).post('/api/mailbox').send();
      const address = created.body.address;

      const res = await request(app)
        .post('/api/inbound')
        .set('x-inbound-secret', TEST_INBOUND_SECRET)
        .send({
          to: address,
          from: 'support@example.org',
          subject: 'Your Verification Code',
          text: 'Your code is 123456.',
        });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.id).toBeDefined();

      const savedMsg = await Message.findById(res.body.id);
      expect(savedMsg).toBeDefined();
      expect(savedMsg.subject).toBe('Your Verification Code');
      expect(savedMsg.address).toBe(address);
      // Verify TTL propagation
      const box = await Mailbox.findOne({ address });
      expect(savedMsg.expiresAt.getTime()).toBe(box.expiresAt.getTime());
    });

    it('rejects inbound request without secret or with wrong secret (401)', async () => {
      const created = await request(app).post('/api/mailbox').send();

      const resNoSecret = await request(app)
        .post('/api/inbound')
        .send({ to: created.body.address, from: 'user@test.com' });
      expect(resNoSecret.status).toBe(401);

      const resWrongSecret = await request(app)
        .post('/api/inbound')
        .set('x-inbound-secret', 'incorrect_secret')
        .send({ to: created.body.address, from: 'user@test.com' });
      expect(resWrongSecret.status).toBe(401);
    });

    it('returns 404 for unknown mailbox', async () => {
      const res = await request(app)
        .post('/api/inbound')
        .set('x-inbound-secret', TEST_INBOUND_SECRET)
        .send({ to: 'unknown_nonexistent@example.com', from: 'user@test.com' });
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/Mailbox not found/i);
    });

    it('normalizes formatted RFC 5322 recipients with angle brackets and names', async () => {
      const created = await request(app).post('/api/mailbox').send();
      const rawAddress = created.body.address;

      // 1. Angle bracket format: <user@domain.com>
      const resAngle = await request(app)
        .post('/api/inbound')
        .set('x-inbound-secret', TEST_INBOUND_SECRET)
        .send({
          to: `<${rawAddress}>`,
          from: 'service@github.com',
          subject: 'Security Code',
          text: 'Code: 739201',
        });
      expect(resAngle.status).toBe(200);

      // 2. Full display name format: "John Doe" <user@domain.com>
      const resDisplay = await request(app)
        .post('/api/inbound')
        .set('x-inbound-secret', TEST_INBOUND_SECRET)
        .send({
          to: `"QA Bot" <${rawAddress}>`,
          from: 'bot@testing.org',
          subject: 'Second Message',
          text: 'Code: 112233',
        });
      expect(resDisplay.status).toBe(200);
    });

    it('rejects inbound email for an expired mailbox', async () => {
      const created = await request(app).post('/api/mailbox').send();
      const address = created.body.address;

      // Manually set mailbox as expired
      await Mailbox.updateOne({ address }, { expiresAt: new Date(Date.now() - 60000) });

      const resExpired = await request(app)
        .post('/api/inbound')
        .set('x-inbound-secret', TEST_INBOUND_SECRET)
        .send({
          to: address,
          from: 'sender@example.com',
          subject: 'Late email',
          text: 'This should not be saved',
        });
      expect(resExpired.status).toBe(404);
      expect(resExpired.body.error).toMatch(/expired/i);
    });

    it('rejects oversized payload with 413 based on maxMessageKB setting', async () => {
      // Set limit to 64 KB
      await Setting.updateOne({ key: 'maxMessageKB' }, { value: 64 }, { upsert: true });

      const created = await request(app).post('/api/mailbox').send();
      const largeText = 'A'.repeat(70 * 1024); // 70 KB > 64 KB

      const res = await request(app)
        .post('/api/inbound')
        .set('x-inbound-secret', TEST_INBOUND_SECRET)
        .send({
          to: created.body.address,
          from: 'sender@example.com',
          text: largeText,
        });

      expect(res.status).toBe(413);
      expect(res.body.error).toMatch(/size exceeds limit/i);
    });
  });

  describe('Admin Auth & Domain CRUD', () => {
    let adminToken;

    beforeEach(async () => {
      const hashedPassword = await bcrypt.hash('adminpass123', 10);
      await Admin.create({ email: 'admin@example.com', password: hashedPassword });

      const loginRes = await request(app)
        .post('/api/admin/login')
        .send({ email: 'admin@example.com', password: 'adminpass123' });
      adminToken = loginRes.body.token;
    });

    it('authenticates admin with valid credentials and rejects wrong password', async () => {
      expect(adminToken).toBeDefined();

      const failedLogin = await request(app)
        .post('/api/admin/login')
        .send({ email: 'admin@example.com', password: 'wrongpassword' });
      expect(failedLogin.status).toBe(401);
    });

    it('manages domains (create, list, patch active status, delete)', async () => {
      // Create new domain
      const createRes = await request(app)
        .post('/api/admin/domains')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'temp-service.net' });
      expect(createRes.status).toBe(200);
      expect(createRes.body.name).toBe('temp-service.net');
      const domainId = createRes.body._id;

      // List domains
      const listRes = await request(app)
        .get('/api/admin/domains')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.some((d) => d.name === 'temp-service.net')).toBe(true);

      // Toggle active status
      const patchRes = await request(app)
        .patch(`/api/admin/domains/${domainId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.active).toBe(false);

      // Public /domains list should now only contain active domains
      const publicDomains = await request(app).get('/api/domains');
      expect(publicDomains.body).not.toContain('temp-service.net');

      // Delete domain
      const delRes = await request(app)
        .delete(`/api/admin/domains/${domainId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(delRes.status).toBe(200);
    });

    it('allows updating rate limits and settings in admin', async () => {
      const updateRes = await request(app)
        .put('/api/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ttlMinutes: 45,
          maxMessageKB: 4096,
          rateLimit10m: 30,
          rateLimitDaily: 250,
          maxAttachmentMB: 10,
          reservedNames: ['admin', 'root', 'security', 'billing'],
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.ttlMinutes).toBe(45);
      expect(updateRes.body.maxMessageKB).toBe(4096);
      expect(updateRes.body.rateLimit10m).toBe(30);
      expect(updateRes.body.rateLimitDaily).toBe(250);
      expect(updateRes.body.maxAttachmentMB).toBe(10);
      expect(updateRes.body.reservedNames).toContain('billing');
    });
  });

  describe('Phase 2 Core Features', () => {
    describe('Custom Mailbox Names & Availability Check', () => {
      it('allows creating a mailbox with a custom prefix', async () => {
        const res = await request(app)
          .post('/api/mailbox')
          .send({ name: 'custom.user_99', domain: 'example.com' });

        expect(res.status).toBe(200);
        expect(res.body.address).toBe('custom.user_99@example.com');
        expect(res.body.token).toBeDefined();
      });

      it('rejects reserved mailbox names', async () => {
        const res = await request(app)
          .post('/api/mailbox')
          .send({ name: 'admin', domain: 'example.com' });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/reserved/i);
      });

      it('rejects duplicate/colliding custom names (409)', async () => {
        await request(app)
          .post('/api/mailbox')
          .send({ name: 'alreadytaken', domain: 'example.com' });

        const secondRes = await request(app)
          .post('/api/mailbox')
          .send({ name: 'alreadytaken', domain: 'example.com' });

        expect(secondRes.status).toBe(409);
        expect(secondRes.body.error).toMatch(/already in use/i);
      });

      it('checks availability via GET /api/mailbox/check', async () => {
        // Reserved name
        const resReserved = await request(app).get('/api/mailbox/check?name=support');
        expect(resReserved.status).toBe(200);
        expect(resReserved.body.available).toBe(false);

        // Taken name
        await request(app).post('/api/mailbox').send({ name: 'existinguser', domain: 'example.com' });
        const resTaken = await request(app).get('/api/mailbox/check?name=existinguser&domain=example.com');
        expect(resTaken.status).toBe(200);
        expect(resTaken.body.available).toBe(false);

        // Free name
        const resFree = await request(app).get('/api/mailbox/check?name=completelyfree123&domain=example.com');
        expect(resFree.status).toBe(200);
        expect(resFree.body.available).toBe(true);
      });
    });

    describe('Verification Helper (Codes & Action Links)', () => {
      it('extracts OTP codes and action links on inbound message', async () => {
        const created = await request(app).post('/api/mailbox').send();
        const address = created.body.address;
        const token = created.body.token;

        const rawEmail = [
          `From: service@test.com`,
          `To: ${address}`,
          `Subject: Verification for your account`,
          `Content-Type: text/html; charset=utf-8`,
          ``,
          `<p>Hi there,</p>`,
          `<p>Your verification code is <strong>739102</strong>.</p>`,
          `<p><a href="https://service.test/verify?token=abc123xyz">Click here to activate your account</a></p>`,
        ].join('\r\n');

        const inboundRes = await request(app)
          .post('/api/inbound')
          .set('x-inbound-secret', TEST_INBOUND_SECRET)
          .send({
            to: address,
            from: 'service@test.com',
            raw: rawEmail,
          });

        expect(inboundRes.status).toBe(200);

        // Fetch message details with token
        const msgRes = await request(app)
          .get(`/api/mailbox/${address}/messages/${inboundRes.body.id}`)
          .set('x-mailbox-token', token);

        expect(msgRes.status).toBe(200);
        expect(msgRes.body.codes).toContain('739102');
        expect(msgRes.body.links.some((l) => l.url === 'https://service.test/verify?token=abc123xyz')).toBe(true);

        // Also test alphanumeric code formats (e.g. Google G-654321 or alphanumeric tokens)
        const alphaInbound = await request(app)
          .post('/api/inbound')
          .set('x-inbound-secret', TEST_INBOUND_SECRET)
          .send({
            to: address,
            from: 'google@accounts.google.com',
            subject: 'Your Google verification code is G-654321',
            text: 'Use security code G-654321 to authenticate.',
          });
        expect(alphaInbound.status).toBe(200);

        const alphaMsg = await request(app)
          .get(`/api/mailbox/${address}/messages/${alphaInbound.body.id}`)
          .set('x-mailbox-token', token);
        expect(alphaMsg.status).toBe(200);
        expect(alphaMsg.body.codes).toContain('G-654321');
      });
    });

    describe('Attachments (GridFS, Blocking & Download Endpoint)', () => {
      it('blocks dangerous attachments (.exe, .bat) and records metadata', async () => {
        const created = await request(app).post('/api/mailbox').send();
        const address = created.body.address;
        const token = created.body.token;

        const rawWithBadAttachment = [
          `From: sender@test.com`,
          `To: ${address}`,
          `Subject: Dangerous file test`,
          `Content-Type: multipart/mixed; boundary="boundary123"`,
          ``,
          `--boundary123`,
          `Content-Type: text/plain`,
          ``,
          `See attached script`,
          `--boundary123`,
          `Content-Type: application/x-msdos-program; name="malware.exe"`,
          `Content-Disposition: attachment; filename="malware.exe"`,
          ``,
          `DANGEROUS_BINARY_PAYLOAD_HERE`,
          `--boundary123--`,
        ].join('\r\n');

        const inboundRes = await request(app)
          .post('/api/inbound')
          .set('x-inbound-secret', TEST_INBOUND_SECRET)
          .send({ to: address, from: 'sender@test.com', raw: rawWithBadAttachment });

        expect(inboundRes.status).toBe(200);

        const msgRes = await request(app)
          .get(`/api/mailbox/${address}/messages/${inboundRes.body.id}`)
          .set('x-mailbox-token', token);

        expect(msgRes.status).toBe(200);
        expect(msgRes.body.attachments.length).toBe(1);
        expect(msgRes.body.attachments[0].filename).toBe('malware.exe');
        expect(msgRes.body.attachments[0].blocked).toBe(true);
        expect(msgRes.body.attachments[0].fileId).toBeUndefined();
      });

      it('stores safe attachments in GridFS and allows authorized download', async () => {
        const created = await request(app).post('/api/mailbox').send();
        const address = created.body.address;
        const token = created.body.token;

        const rawWithSafeAttachment = [
          `From: sender@test.com`,
          `To: ${address}`,
          `Subject: Safe file test`,
          `Content-Type: multipart/mixed; boundary="boundary456"`,
          ``,
          `--boundary456`,
          `Content-Type: text/plain`,
          ``,
          `Please find report attached.`,
          `--boundary456`,
          `Content-Type: text/plain; name="report.txt"`,
          `Content-Disposition: attachment; filename="report.txt"`,
          ``,
          `CONFIDENTIAL_REPORT_CONTENT_12345`,
          `--boundary456--`,
        ].join('\r\n');

        const inboundRes = await request(app)
          .post('/api/inbound')
          .set('x-inbound-secret', TEST_INBOUND_SECRET)
          .send({ to: address, from: 'sender@test.com', raw: rawWithSafeAttachment });

        expect(inboundRes.status).toBe(200);

        const msgRes = await request(app)
          .get(`/api/mailbox/${address}/messages/${inboundRes.body.id}`)
          .set('x-mailbox-token', token);

        expect(msgRes.status).toBe(200);
        expect(msgRes.body.attachments.length).toBe(1);
        const att = msgRes.body.attachments[0];
        expect(att.filename).toBe('report.txt');
        expect(att.blocked).toBe(false);
        expect(att.fileId).toBeDefined();

        // Download attachment - unauthorized (no token) -> 401
        const dlNoToken = await request(app)
          .get(`/api/mailbox/${address}/attachments/${att.fileId}`);
        expect(dlNoToken.status).toBe(401);

        // Download attachment - authorized
        const dlValid = await request(app)
          .get(`/api/mailbox/${address}/attachments/${att.fileId}?token=${token}`);
        expect(dlValid.status).toBe(200);
        expect(dlValid.headers['content-disposition']).toMatch(/attachment/);
        expect(dlValid.headers['x-content-type-options']).toBe('nosniff');
        expect(dlValid.text).toContain('CONFIDENTIAL_REPORT_CONTENT_12345');
      });
    });

    describe('Server-Sent Events (SSE Stream Endpoint)', () => {
      it('rejects SSE stream request without valid token (401)', async () => {
        const created = await request(app).post('/api/mailbox').send();
        const address = created.body.address;

        const res = await request(app).get(`/api/mailbox/${address}/stream`);
        expect(res.status).toBe(401);
      });
    });

    describe('Phase 3 Share Links', () => {
      it('creates, reads, and revokes expiring public share links', async () => {
        const created = await request(app).post('/api/mailbox').send();
        const address = created.body.address;
        const token = created.body.token;

        const msg = await Message.create({
          address,
          from: 'newsletter@example.com',
          subject: 'Weekly Digest',
          text: 'Here is your weekly summary.',
          html: '<p>Here is your weekly summary.</p>',
          expiresAt: new Date(Date.now() + 3600000),
        });

        // 1. Create share link without token -> 401
        const resNoToken = await request(app)
          .post(`/api/mailbox/${address}/messages/${msg._id}/share`)
          .send({ durationHours: 2 });
        expect(resNoToken.status).toBe(401);

        // 2. Create share link with valid token -> 200
        const resShare = await request(app)
          .post(`/api/mailbox/${address}/messages/${msg._id}/share`)
          .set('x-mailbox-token', token)
          .send({ durationHours: 2 });

        expect(resShare.status).toBe(200);
        expect(resShare.body.token).toBeDefined();
        expect(resShare.body.url).toBe(`/share/${resShare.body.token}`);
        const shareToken = resShare.body.token;

        // 3. Public read-only access (no auth token required) -> 200
        const resPublicRead = await request(app).get(`/api/share/${shareToken}`);
        expect(resPublicRead.status).toBe(200);
        expect(resPublicRead.body.subject).toBe('Weekly Digest');
        expect(resPublicRead.body.from).toBe('newsletter@example.com');
        expect(resPublicRead.body.expiresAt).toBeDefined();

        // 4. Revoke share link with token -> 200
        const resRevoke = await request(app)
          .delete(`/api/mailbox/${address}/messages/${msg._id}/share/${shareToken}`)
          .set('x-mailbox-token', token);
        expect(resRevoke.status).toBe(200);
        expect(resRevoke.body.ok).toBe(true);

        // 5. Subsequent access after revocation -> 404
        const resAfterRevoke = await request(app).get(`/api/share/${shareToken}`);
        expect(resAfterRevoke.status).toBe(404);
        expect(resAfterRevoke.body.error).toMatch(/expired or been revoked/i);
      });
    });
  });

  describe('Phase 4 Business, Growth & Developer API v1', () => {
    describe('User Accounts, Authentication & Premium Subscriptions', () => {
      it('registers a user, prevents duplicate emails, and logs in with bcrypt', async () => {
        // 1. Register new user
        const resReg = await request(app)
          .post('/api/user/register')
          .send({ email: 'developer@example.com', password: 'password123' });

        expect(resReg.status).toBe(200);
        expect(resReg.body.token).toBeDefined();
        expect(resReg.body.user.email).toBe('developer@example.com');
        expect(resReg.body.user.isPremium).toBe(false);

        // 2. Prevent duplicate email registration
        const resDup = await request(app)
          .post('/api/user/register')
          .send({ email: 'developer@example.com', password: 'differentPassword' });
        expect(resDup.status).toBe(409);

        // 3. Login with correct password
        const resLogin = await request(app)
          .post('/api/user/login')
          .send({ email: 'developer@example.com', password: 'password123' });
        expect(resLogin.status).toBe(200);
        expect(resLogin.body.token).toBeDefined();

        // 4. Login with wrong password
        const resWrongPass = await request(app)
          .post('/api/user/login')
          .send({ email: 'developer@example.com', password: 'wrongpassword' });
        expect(resWrongPass.status).toBe(401);
      });

      it('enforces premium requirement on API key generation and admin grant/revoke', async () => {
        // Register free user
        const reg = await request(app)
          .post('/api/user/register')
          .send({ email: 'user@example.com', password: 'password123' });
        const userToken = reg.body.token;

        // Try to generate API key as free user -> 403 Forbidden
        const resKeyForbidden = await request(app)
          .post('/api/user/api-keys')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ name: 'My Key' });
        expect(resKeyForbidden.status).toBe(403);
        expect(resKeyForbidden.body.error).toMatch(/premium/i);

        // Admin grants premium
        const admin = await Admin.create({
          email: 'admin@tempmail.com',
          password: await bcrypt.hash('adminpass123', 10),
        });
        const adminToken = (
          await request(app)
            .post('/api/admin/login')
            .send({ email: 'admin@tempmail.com', password: 'adminpass123' })
        ).body.token;

        const dbUser = await User.findOne({ email: 'user@example.com' });
        const resGrant = await request(app)
          .post(`/api/admin/users/${dbUser._id}/grant-premium`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ days: 30 });
        expect(resGrant.status).toBe(200);
        expect(resGrant.body.isPremium).toBe(true);

        // Now user can generate API key
        const resKeySuccess = await request(app)
          .post('/api/user/api-keys')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ name: 'Production CI Key' });
        expect(resKeySuccess.status).toBe(200);
        expect(resKeySuccess.body.apiKey).toMatch(/^tm_[a-f0-9]{48}$/);
        expect(resKeySuccess.body.prefix).toMatch(/^tm_/);
        const rawApiKey = resKeySuccess.body.apiKey;

        // Test Developer API v1 with the generated API key
        const resV1Mailbox = await request(app)
          .post('/api/v1/mailbox')
          .set('X-Api-Key', rawApiKey)
          .send({ name: 'api-tester', domain: 'example.com' });
        expect(resV1Mailbox.status).toBe(200);
        expect(resV1Mailbox.body.address).toBe('api-tester@example.com');
        expect(resV1Mailbox.body.ttlSeconds).toBe(86400); // 24 hours for premium

        // Admin revokes premium
        const resRevoke = await request(app)
          .post(`/api/admin/users/${dbUser._id}/revoke-premium`)
          .set('Authorization', `Bearer ${adminToken}`);
        expect(resRevoke.status).toBe(200);
        expect(resRevoke.body.isPremium).toBe(false);

        // Developer API v1 now rejects the API key with 403
        const resV1AfterRevoke = await request(app)
          .post('/api/v1/mailbox')
          .set('X-Api-Key', rawApiKey)
          .send({ domain: 'example.com' });
        expect(resV1AfterRevoke.status).toBe(403);
        expect(resV1AfterRevoke.body.error).toMatch(/premium/i);
      });

      it('supports Firebase Google sign-in and NOWPayments crypto subscriptions', async () => {
        function mockFirebaseToken(email, uid) {
          const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
          const payload = Buffer.from(JSON.stringify({
            sub: uid,
            email,
            email_verified: true,
            iss: 'https://securetoken.google.com/temp-sms-d6d3a',
            aud: 'temp-sms-d6d3a',
            exp: Math.floor(Date.now() / 1000) + 3600,
          })).toString('base64url');
          return `${header}.${payload}.mocksignature`;
        }

        // 1. User signs in with Firebase
        const userFbToken = mockFirebaseToken('crypto_subscriber@example.com', 'firebase_user_999');
        const resFbUser = await request(app)
          .post('/api/user/firebase')
          .send({ idToken: userFbToken });
        expect(resFbUser.status).toBe(200);
        expect(resFbUser.body.token).toBeDefined();
        expect(resFbUser.body.user.email).toBe('crypto_subscriber@example.com');
        const userJwt = resFbUser.body.token;

        // Verify profile
        const resProfile = await request(app)
          .get('/api/user/me')
          .set('Authorization', `Bearer ${userJwt}`);
        expect(resProfile.status).toBe(200);
        expect(resProfile.body.email).toBe('crypto_subscriber@example.com');
        expect(resProfile.body.isPremium).toBe(false);

        // 2. NOWPayments Webhook IPN payment finished
        const userInDb = await User.findOne({ email: 'crypto_subscriber@example.com' });
        const resWebhook = await request(app)
          .post('/api/user/nowpayments/webhook')
          .send({
            payment_status: 'finished',
            order_id: `tm_${userInDb._id}_123456`,
            price_amount: 9.99,
            pay_currency: 'btc',
          });
        expect(resWebhook.status).toBe(200);
        expect(resWebhook.body.received).toBe(true);

        // User is now Premium!
        const resUpdatedProfile = await request(app)
          .get('/api/user/me')
          .set('Authorization', `Bearer ${userJwt}`);
        expect(resUpdatedProfile.status).toBe(200);
        expect(resUpdatedProfile.body.isPremium).toBe(true);

        // 3. Admin Firebase Authentication
        // Unauthorized admin attempt fails with 403
        const unauthFbToken = mockFirebaseToken('random_person@example.com', 'admin_fb_403');
        const resUnauth = await request(app)
          .post('/api/admin/firebase')
          .send({ idToken: unauthFbToken });
        expect(resUnauth.status).toBe(403);

        // Authorized admin succeeds
        await Admin.create({
          email: 'official_admin@tempmail.com',
          password: await bcrypt.hash('secretpass', 10),
          role: 'owner',
        });
        const authFbToken = mockFirebaseToken('official_admin@tempmail.com', 'admin_fb_200');
        const resAdminFb = await request(app)
          .post('/api/admin/firebase')
          .send({ idToken: authFbToken });
        expect(resAdminFb.status).toBe(200);
        expect(resAdminFb.body.token).toBeDefined();
        expect(resAdminFb.body.admin.email).toBe('official_admin@tempmail.com');
      });
    });

    describe('Blog & SEO Endpoints', () => {
      it('creates and serves blog posts with dynamic sitemap and robots.txt', async () => {
        const admin = await Admin.create({
          email: 'admin2@tempmail.com',
          password: await bcrypt.hash('adminpass123', 10),
        });
        const adminToken = (
          await request(app)
            .post('/api/admin/login')
            .send({ email: 'admin2@tempmail.com', password: 'adminpass123' })
        ).body.token;

        // Create blog post via Admin
        const resPost = await request(app)
          .post('/api/admin/posts')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            title: 'Why Disposable Email Matters',
            slug: 'why-disposable-email-matters',
            metaDescription: 'Learn how temporary email safeguards your private data.',
            body: 'Detailed guide on email privacy.',
            published: true,
          });
        expect(resPost.status).toBe(200);
        expect(resPost.body.slug).toBe('why-disposable-email-matters');

        // Public list
        const resPublicList = await request(app).get('/api/posts');
        expect(resPublicList.status).toBe(200);
        expect(resPublicList.body.posts.length).toBeGreaterThanOrEqual(1);

        // Public read single post
        const resSingle = await request(app).get('/api/posts/why-disposable-email-matters');
        expect(resSingle.status).toBe(200);
        expect(resSingle.body.title).toBe('Why Disposable Email Matters');

        // Sitemap XML
        const resSitemap = await request(app).get('/api/sitemap.xml');
        expect(resSitemap.status).toBe(200);
        expect(resSitemap.headers['content-type']).toMatch(/xml/);
        expect(resSitemap.text).toContain('/blog/why-disposable-email-matters');

        // Robots.txt
        const resRobots = await request(app).get('/api/robots.txt');
        expect(resRobots.status).toBe(200);
        expect(resRobots.text).toContain('User-agent: *');
        expect(resRobots.text).toContain('Sitemap:');
      });
    });

    describe('Domain Health Checks & Ads Settings', () => {
      it('supports DNS health checking and advertising configurations', async () => {
        const admin = await Admin.create({
          email: 'admin3@tempmail.com',
          password: await bcrypt.hash('adminpass123', 10),
        });
        const adminToken = (
          await request(app)
            .post('/api/admin/login')
            .send({ email: 'admin3@tempmail.com', password: 'adminpass123' })
        ).body.token;

        const d = await Domain.findOne({ name: 'example.com' });

        // Domain Health Check endpoint
        const resHealth = await request(app)
          .post(`/api/admin/domains/${d._id}/check`)
          .set('Authorization', `Bearer ${adminToken}`);
        expect(resHealth.status).toBe(200);
        expect(resHealth.body.status).toBeDefined();

        // Save Ads settings in Admin
        const resAds = await request(app)
          .put('/api/admin/settings')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            ttlMinutes: 60,
            maxMessageKB: 2048,
            adsEnabled: true,
            adHeader: '<!-- header ad -->',
            adBelowCard: '<!-- card ad -->',
            adSidebar: '<!-- sidebar ad -->',
          });
        expect(resAds.status).toBe(200);
        expect(resAds.body.adsEnabled).toBe(true);

        // Verify public ads config
        const resPublicAds = await request(app).get('/api/config/ads');
        expect(resPublicAds.status).toBe(200);
        expect(resPublicAds.body.adsEnabled).toBe(true);
        expect(resPublicAds.body.adHeader).toBe('<!-- header ad -->');
      });
    });
  });

  describe('Phase 5 Admin, Operations & Security', () => {
    describe('Public Health & Monitoring Endpoint', () => {
      it('returns db status, uptime, and 200 OK on GET /api/health', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.db).toBe('connected');
        expect(typeof res.body.uptime).toBe('number');
        expect(res.body.timestamp).toBeDefined();
      });
    });

    describe('Abuse Controls, Blocklists & Spam Scoring', () => {
      it('blocks inbound requests matching blocked domains or addresses with 403', async () => {
        const created = await request(app).post('/api/mailbox').send();
        const address = created.body.address;

        // Add domain to blocklist
        await Blocklist.create({ type: 'domain', value: 'spammer.org', reason: 'High spam domain' });

        // Try inbound email from blocked domain
        const resBlocked = await request(app)
          .post('/api/inbound')
          .set('x-inbound-secret', TEST_INBOUND_SECRET)
          .send({
            to: address,
            from: 'badguy@spammer.org',
            subject: 'Hello friend',
            text: 'Test message',
          });
        expect(resBlocked.status).toBe(403);
        expect(resBlocked.body.error).toMatch(/blocked by policy/i);

        // Inbound from clean sender succeeds
        const resClean = await request(app)
          .post('/api/inbound')
          .set('x-inbound-secret', TEST_INBOUND_SECRET)
          .send({
            to: address,
            from: 'cleanguy@goodservice.com',
            subject: 'Normal message',
            text: 'Hello there',
          });
        expect(resClean.status).toBe(200);
      });

      it('calculates spam score and flags suspicious messages', async () => {
        const created = await request(app).post('/api/mailbox').send();
        const address = created.body.address;

        const spamRes = await request(app)
          .post('/api/inbound')
          .set('x-inbound-secret', TEST_INBOUND_SECRET)
          .send({
            to: address,
            from: 'lottery@jackpot.com',
            subject: 'URGENT CLAIM PRIZE AND LOTTERY WINNER',
            text: 'You have won a lottery prize of 1 million dollars. Send bitcoin transfer and wire transfer immediately to beneficiary.',
          });
        expect(spamRes.status).toBe(200);

        const savedMsg = await Message.findById(spamRes.body.id);
        expect(savedMsg).toBeDefined();
        expect(savedMsg.spamScore).toBeGreaterThanOrEqual(50);
        expect(savedMsg.isSpam).toBe(true);
      });

      it('allows users to report messages and admin to review and block', async () => {
        const created = await request(app).post('/api/mailbox').send();
        const address = created.body.address;
        const token = created.body.token;

        const msg = await Message.create({
          address,
          from: 'phisher@fakebank.com',
          subject: 'Account update required',
          text: 'Update login credentials',
          expiresAt: new Date(Date.now() + 3600000),
        });

        // 1. User reports message
        const resReport = await request(app)
          .post(`/api/mailbox/${address}/messages/${msg._id}/report`)
          .set('x-mailbox-token', token)
          .send({ reason: 'Phishing attempt' });
        expect(resReport.status).toBe(200);
        expect(resReport.body.ok).toBe(true);

        // 2. Admin reviews report and 1-click blocks sender
        const admin = await Admin.create({
          email: 'admin_ops@example.com',
          password: await bcrypt.hash('adminpass123', 10),
          role: 'owner',
        });
        const adminToken = (
          await request(app)
            .post('/api/admin/login')
            .send({ email: 'admin_ops@example.com', password: 'adminpass123' })
        ).body.token;

        const resReportsList = await request(app)
          .get('/api/admin/reports')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(resReportsList.status).toBe(200);
        expect(resReportsList.body.length).toBeGreaterThanOrEqual(1);

        const reportId = resReportsList.body[0]._id;
        const resBlock = await request(app)
          .post(`/api/admin/reports/${reportId}/block`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ type: 'domain' });
        expect(resBlock.status).toBe(200);
        expect(resBlock.body.blocked.value).toBe('fakebank.com');

        // Verify domain is now blocked
        const blockedExists = await Blocklist.exists({ type: 'domain', value: 'fakebank.com' });
        expect(blockedExists).toBeTruthy();
      });
    });

    describe('Admin Roles, Moderator Restrictions & Audit Logs', () => {
      it('enforces role restrictions: moderators cannot manage settings or domains', async () => {
        const owner = await Admin.create({
          email: 'owner@example.com',
          password: await bcrypt.hash('ownerpass123', 10),
          role: 'owner',
        });
        const ownerToken = (
          await request(app)
            .post('/api/admin/login')
            .send({ email: 'owner@example.com', password: 'ownerpass123' })
        ).body.token;

        // Owner creates moderator
        const resCreateMod = await request(app)
          .post('/api/admin/admins')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send({ email: 'moderator@example.com', password: 'moderatorpass123', role: 'moderator' });
        expect(resCreateMod.status).toBe(200);
        expect(resCreateMod.body.role).toBe('moderator');

        // Moderator logs in
        const modToken = (
          await request(app)
            .post('/api/admin/login')
            .send({ email: 'moderator@example.com', password: 'moderatorpass123' })
        ).body.token;

        // Moderator can read messages
        const resModMessages = await request(app)
          .get('/api/admin/messages')
          .set('Authorization', `Bearer ${modToken}`);
        expect(resModMessages.status).toBe(200);

        // Moderator CANNOT update settings -> 403 Forbidden
        const resModSettings = await request(app)
          .put('/api/admin/settings')
          .set('Authorization', `Bearer ${modToken}`)
          .send({ ttlMinutes: 45 });
        expect(resModSettings.status).toBe(403);
        expect(resModSettings.body.error).toMatch(/Requires Owner role/i);

        // Moderator CANNOT add domain -> 403 Forbidden
        const resModDomain = await request(app)
          .post('/api/admin/domains')
          .set('Authorization', `Bearer ${modToken}`)
          .send({ name: 'forbidden.com' });
        expect(resModDomain.status).toBe(403);

        // Audit logs recorded the login and admin creation
        const resAudit = await request(app)
          .get('/api/admin/audit-logs')
          .set('Authorization', `Bearer ${ownerToken}`);
        expect(resAudit.status).toBe(200);
        expect(resAudit.body.some((l) => l.action === 'create_admin')).toBe(true);
      });
    });

    describe('Admin 2FA (TOTP) & Backup Codes', () => {
      it('enables 2FA, requires TOTP token at login, and accepts backup codes', async () => {
        const admin = await Admin.create({
          email: 'totp_admin@example.com',
          password: await bcrypt.hash('secretpass123', 10),
          role: 'owner',
        });
        const loginToken = (
          await request(app)
            .post('/api/admin/login')
            .send({ email: 'totp_admin@example.com', password: 'secretpass123' })
        ).body.token;

        // 1. Setup 2FA
        const resSetup = await request(app)
          .post('/api/admin/2fa/setup')
          .set('Authorization', `Bearer ${loginToken}`);
        expect(resSetup.status).toBe(200);
        expect(resSetup.body.secret).toBeDefined();
        const secret = resSetup.body.secret;

        // 2. Enable 2FA with valid TOTP code
        const validCode = generateSync({ secret });
        const resEnable = await request(app)
          .post('/api/admin/2fa/enable')
          .set('Authorization', `Bearer ${loginToken}`)
          .send({ secret, token: validCode });
        expect(resEnable.status).toBe(200);
        expect(resEnable.body.backupCodes.length).toBe(8);
        const backupCode = resEnable.body.backupCodes[0];

        // 3. Subsequent login without 2FA prompt -> require2fa: true
        const resLoginPrompt = await request(app)
          .post('/api/admin/login')
          .send({ email: 'totp_admin@example.com', password: 'secretpass123' });
        expect(resLoginPrompt.status).toBe(200);
        expect(resLoginPrompt.body.require2fa).toBe(true);

        // 4. Login with wrong 2FA code -> 401
        const resWrong2FA = await request(app)
          .post('/api/admin/login')
          .send({ email: 'totp_admin@example.com', password: 'secretpass123', totpCode: '000000' });
        expect(resWrong2FA.status).toBe(401);

        // 5. Login with backup code -> 200 OK
        const resBackupLogin = await request(app)
          .post('/api/admin/login')
          .send({ email: 'totp_admin@example.com', password: 'secretpass123', totpCode: backupCode });
        expect(resBackupLogin.status).toBe(200);
        expect(resBackupLogin.body.token).toBeDefined();

        // 6. Used backup code is consumed and cannot be reused
        const resReuseBackup = await request(app)
          .post('/api/admin/login')
          .send({ email: 'totp_admin@example.com', password: 'secretpass123', totpCode: backupCode });
        expect(resReuseBackup.status).toBe(401);
      });
    });

    describe('Backups Export & Import', () => {
      it('exports configuration bundle and restores via import with dry-run preview', async () => {
        const owner = await Admin.create({
          email: 'backup_owner@example.com',
          password: await bcrypt.hash('ownerpass123', 10),
          role: 'owner',
        });
        const ownerToken = (
          await request(app)
            .post('/api/admin/login')
            .send({ email: 'backup_owner@example.com', password: 'ownerpass123' })
        ).body.token;

        // 1. Export backup JSON
        const resExport = await request(app)
          .get('/api/admin/backup/export')
          .set('Authorization', `Bearer ${ownerToken}`);
        expect(resExport.status).toBe(200);
        expect(resExport.body.version).toBe('1.0');
        expect(Array.isArray(resExport.body.domains)).toBe(true);
        expect(Array.isArray(resExport.body.settings)).toBe(true);
        const backupJson = resExport.body;

        // Add a test domain into the backup data
        backupJson.domains.push({ name: 'restored-backup.com', active: true });

        // 2. Dry-Run Import Preview
        const resDryRun = await request(app)
          .post('/api/admin/backup/import?dryRun=true')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send(backupJson);
        expect(resDryRun.status).toBe(200);
        expect(resDryRun.body.dryRun).toBe(true);
        expect(resDryRun.body.counts.domains).toBeGreaterThanOrEqual(1);

        // Verify restored-backup.com is NOT yet created
        expect(await Domain.exists({ name: 'restored-backup.com' })).toBeFalsy();

        // 3. Real Import
        const resRealImport = await request(app)
          .post('/api/admin/backup/import')
          .set('Authorization', `Bearer ${ownerToken}`)
          .send(backupJson);
        expect(resRealImport.status).toBe(200);
        expect(resRealImport.body.ok).toBe(true);

        // Verify restored-backup.com is now in DB
        expect(await Domain.exists({ name: 'restored-backup.com' })).toBeTruthy();
      });
    });
  });

  describe('Phase 6 Link Safety & Containerization', () => {
    describe('Link Safety Analyzer & Rewrite Engine', () => {
      it('rewrites external links to in-app confirmation route with rel="noopener noreferrer nofollow"', () => {
        const inputHtml = '<p>Check <a href="https://example.com/login">this link</a> now.</p>';
        const rewritten = rewriteHtmlLinks(inputHtml);

        expect(rewritten).toContain('/confirm-link?url=https%3A%2F%2Fexample.com%2Flogin');
        expect(rewritten).toContain('rel="noopener noreferrer nofollow"');
        expect(rewritten).toContain('(example.com)');
      });

      it('detects IP address links, punycode lookalikes, URL shorteners, and mismatched text', () => {
        // 1. IP address link
        const ipCheck = analyzeLinkSafety('http://192.168.1.1/admin');
        expect(ipCheck.isHighRisk).toBe(true);
        expect(ipCheck.warnings.some((w) => w.type === 'ip')).toBe(true);

        // 2. Punycode lookalike domain
        const punyCheck = analyzeLinkSafety('https://xn--pple-43d.com');
        expect(punyCheck.isHighRisk).toBe(true);
        expect(punyCheck.warnings.some((w) => w.type === 'punycode')).toBe(true);

        // 3. URL shortener
        const shortCheck = analyzeLinkSafety('https://bit.ly/3xyz');
        expect(shortCheck.warnings.some((w) => w.type === 'shortener')).toBe(true);

        // 4. Mismatched anchor text vs actual destination
        const mismatchCheck = analyzeLinkSafety('https://phishingsite.com', 'https://paypal.com');
        expect(mismatchCheck.isHighRisk).toBe(true);
        expect(mismatchCheck.warnings.some((w) => w.type === 'mismatch')).toBe(true);
      });
    });
  });
});
