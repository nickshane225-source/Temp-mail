import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import app from '../src/app.js';
import { User, Payment, WebhookLog } from '../src/models.js';
import { getSafeRedirect } from '../../frontend/src/utils/safeRedirect.js';

let mongoServer;
const TEST_JWT_SECRET = 'test_jwt_secret_32_characters_long_val';

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Payment.deleteMany({});
  await WebhookLog.deleteMany({});
});

describe('Phase 4: Auth, Payments Hardening & Idempotency', () => {
  describe('GET /api/user/payment-status', () => {
    it('requires authentication and blocks unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/user/payment-status?order=tm_123_456');
      expect(res.status).toBe(401);
    });

    it('requires order query parameter with 400', async () => {
      const reg = await request(app)
        .post('/api/user/register')
        .send({ email: 'user1@example.com', password: 'password123' });
      const token = reg.body.token;

      const res = await request(app)
        .get('/api/user/payment-status')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Order ID is required');
    });

    it('blocks cross-user payment status inspection with 403', async () => {
      // User A
      const regA = await request(app)
        .post('/api/user/register')
        .send({ email: 'user_a@example.com', password: 'password123' });
      const tokenA = regA.body.token;
      const userA = await User.findOne({ email: 'user_a@example.com' });

      // User B
      const regB = await request(app)
        .post('/api/user/register')
        .send({ email: 'user_b@example.com', password: 'password123' });
      const tokenB = regB.body.token;

      // Payment for User A
      const orderIdA = `tm_${userA._id}_11111`;
      await Payment.create({
        userId: userA._id,
        userEmail: userA.email,
        orderId: orderIdA,
        amount: 4.99,
        status: 'finished',
      });

      // User B attempts to inspect User A's order
      const resCross = await request(app)
        .get(`/api/user/payment-status?order=${orderIdA}`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(resCross.status).toBe(403);
      expect(resCross.body.error).toContain('Unauthorized');

      // User A inspects their own order
      const resOwner = await request(app)
        .get(`/api/user/payment-status?order=${orderIdA}`)
        .set('Authorization', `Bearer ${tokenA}`);

      expect(resOwner.status).toBe(200);
      expect(resOwner.body.status).toBe('finished');
      expect(resOwner.body.orderId).toBe(orderIdA);
    });
  });

  describe('NOWPayments Webhook Idempotency & Signature Enforcement', () => {
    it('atomically sets premiumGranted and prevents duplicate grants on multiple webhook callbacks', async () => {
      const reg = await request(app)
        .post('/api/user/register')
        .send({ email: 'crypto_user@example.com', password: 'password123' });
      const user = await User.findOne({ email: 'crypto_user@example.com' });

      const orderId = `tm_${user._id}_${Date.now()}`;
      await Payment.create({
        userId: user._id,
        userEmail: user.email,
        orderId,
        amount: 4.99,
        status: 'waiting',
        premiumGranted: false,
      });

      const payload = {
        payment_status: 'finished',
        order_id: orderId,
        payment_id: 'np_123456789',
        actually_paid: 4.99,
      };

      // First webhook callback: confirms and grants 30 days
      const res1 = await request(app)
        .post('/api/user/nowpayments/webhook')
        .send(payload);
      expect(res1.status).toBe(200);
      expect(res1.body.received).toBe(true);

      const userAfterFirst = await User.findById(user._id);
      expect(userAfterFirst.isPremium).toBe(true);
      const firstExpire = new Date(userAfterFirst.premiumUntil).getTime();

      const paymentDoc = await Payment.findOne({ orderId });
      expect(paymentDoc.premiumGranted).toBe(true);
      expect(paymentDoc.status).toBe('finished');

      // Second webhook callback (e.g. redundant 'finished' notification from gateway)
      const res2 = await request(app)
        .post('/api/user/nowpayments/webhook')
        .send(payload);
      expect(res2.status).toBe(200);

      // Verify expiration timestamp was NOT extended by another 30 days (+60 days)
      const userAfterSecond = await User.findById(user._id);
      const secondExpire = new Date(userAfterSecond.premiumUntil).getTime();
      expect(secondExpire).toBe(firstExpire);
    });

    it('rejects webhooks with missing or invalid HMAC signature when secret is configured', async () => {
      const testSecret = 'np_ipn_secret_test_key_555';
      process.env.NOWPAYMENTS_IPN_SECRET = testSecret;

      const dummyUserId = new mongoose.Types.ObjectId();
      const payload = {
        payment_status: 'finished',
        order_id: `tm_${dummyUserId}_999`,
        actually_paid: 4.99,
      };

      // 1. Missing signature header -> 400
      const resMissingSig = await request(app)
        .post('/api/user/nowpayments/webhook')
        .send(payload);
      expect(resMissingSig.status).toBe(400);
      expect(resMissingSig.body.error).toContain('Missing x-nowpayments-sig');

      // 2. Tampered / invalid signature -> 400
      const resBadSig = await request(app)
        .post('/api/user/nowpayments/webhook')
        .set('x-nowpayments-sig', 'deadbeef00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899aabb')
        .send(payload);
      expect(resBadSig.status).toBe(400);
      expect(resBadSig.body.error).toContain('Invalid NOWPayments IPN signature');

      // 3. Valid HMAC-SHA512 signature -> 200
      function sortObject(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
        return Object.keys(obj).sort().reduce((acc, k) => {
          acc[k] = (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k]))
            ? sortObject(obj[k])
            : obj[k];
          return acc;
        }, {});
      }
      const sortedPayload = JSON.stringify(sortObject(payload));
      const validSig = crypto
        .createHmac('sha512', testSecret)
        .update(sortedPayload)
        .digest('hex');

      const resValid = await request(app)
        .post('/api/user/nowpayments/webhook')
        .set('x-nowpayments-sig', validSig)
        .send(payload);
      expect(resValid.status).toBe(200);
      expect(resValid.body.received).toBe(true);

      // Clean up test env
      delete process.env.NOWPAYMENTS_IPN_SECRET;
    });

    it('rejects webhooks with 503 in production if NOWPAYMENTS_IPN_SECRET is unset', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      delete process.env.NOWPAYMENTS_IPN_SECRET;

      const res = await request(app)
        .post('/api/user/nowpayments/webhook')
        .send({ payment_status: 'finished', order_id: 'test_order' });

      expect(res.status).toBe(503);
      expect(res.body.error).toContain('not configured');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Safe Internal Redirect Sanitizer', () => {
    it('allows valid internal paths and query parameters', () => {
      expect(getSafeRedirect('/account')).toBe('/account');
      expect(getSafeRedirect('/premium?intent=upgrade')).toBe('/premium?intent=upgrade');
      expect(getSafeRedirect('/api/docs')).toBe('/api/docs');
      expect(getSafeRedirect('/#faq')).toBe('/#faq');
    });

    it('rejects protocol-relative open redirect attacks', () => {
      expect(getSafeRedirect('//evil.com')).toBe('/account');
      expect(getSafeRedirect('///evil.com')).toBe('/account');
      expect(getSafeRedirect('/\\evil.com')).toBe('/account');
    });

    it('rejects absolute URLs and arbitrary schemes', () => {
      expect(getSafeRedirect('https://evil.com')).toBe('/account');
      expect(getSafeRedirect('http://evil.com/premium')).toBe('/account');
      expect(getSafeRedirect('javascript:alert(1)')).toBe('/account');
      expect(getSafeRedirect('data:text/html,<h1>bad</h1>')).toBe('/account');
    });

    it('handles empty, null, or malformed inputs cleanly', () => {
      expect(getSafeRedirect(null)).toBe('/account');
      expect(getSafeRedirect(undefined)).toBe('/account');
      expect(getSafeRedirect('')).toBe('/account');
      expect(getSafeRedirect('   ')).toBe('/account');
    });
  });
});
