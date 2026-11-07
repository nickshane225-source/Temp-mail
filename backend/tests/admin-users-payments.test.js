import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { User, Admin, Payment, WebhookLog, Mailbox } from '../src/models.js';

const TEST_SECRET = 'super_secure_jwt_secret_for_testing_purposes_only_32chars';
process.env.JWT_SECRET = TEST_SECRET;

let mongod;
let adminToken;
let regularUser;
let regularUserToken;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  // Create admin
  const hashedAdminPassword = await bcrypt.hash('AdminSecret123!', 10);
  const admin = await Admin.create({
    email: 'owner@tempmail.internal',
    password: hashedAdminPassword,
    role: 'owner',
  });
  adminToken = jwt.sign(
    { id: admin._id, email: admin.email, role: admin.role },
    TEST_SECRET,
    { expiresIn: '1h' }
  );

  // Create test regular user
  const hashedUserPassword = await bcrypt.hash('UserPassword123!', 10);
  regularUser = await User.create({
    email: 'client@example.com',
    password: hashedUserPassword,
    status: 'active',
    isPremium: false,
    apiKeys: [{
      keyId: 'key_123',
      name: 'CI/CD Key',
      keyHash: 'fakehash',
      prefix: 'tm_live_ci',
      createdAt: new Date(),
    }],
  });
  regularUserToken = jwt.sign(
    { userId: regularUser._id, email: regularUser.email },
    TEST_SECRET,
    { expiresIn: '7d' }
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});

describe('Task 1 & 2: Models and User Management API', () => {
  it('creates and verifies Payment and WebhookLog models', async () => {
    const payment = await Payment.create({
      userId: regularUser._id,
      userEmail: regularUser.email,
      provider: 'nowpayments',
      orderId: 'NP_ORD_1001',
      paymentId: 'PAY_554433',
      amount: 4.99,
      status: 'finished',
      actuallyPaid: 4.99,
      durationDays: 30,
    });
    expect(payment._id).toBeDefined();
    expect(payment.status).toBe('finished');

    const log = await WebhookLog.create({
      provider: 'nowpayments',
      event: 'payment_finished',
      status: 'processed',
      ip: '127.0.0.1',
      payload: { payment_id: 'PAY_554433' },
    });
    expect(log._id).toBeDefined();
    expect(log.status).toBe('processed');
  });

  it('GET /api/admin/users lists paginated users with search and filter', async () => {
    const res = await request(app)
      .get('/api/admin/users?page=1&limit=10&search=client')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.users).toBeInstanceOf(Array);
    expect(res.body.users.length).toBeGreaterThan(0);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.users[0].email).toBe('client@example.com');
  });

  it('GET /api/admin/users/:id returns user detail drawer information', async () => {
    // Add a mailbox for user
    await Mailbox.create({
      address: 'clientbox@tempmail.internal',
      domain: 'tempmail.internal',
      tokenHash: 'dummy',
    });

    const res = await request(app)
      .get(`/api/admin/users/${regularUser._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('client@example.com');
    expect(res.body.apiKeys).toHaveLength(1);
    expect(res.body.apiKeys[0].name).toBe('CI/CD Key');
    expect(res.body.payments).toBeInstanceOf(Array);
  });

  it('POST /api/admin/users/:id/grant-custom-premium grants custom premium days with reason', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${regularUser._id}/grant-custom-premium`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ days: 14, reason: 'Promotional loyalty bonus' });

    expect(res.status).toBe(200);
    expect(res.body.isPremium).toBe(true);
    expect(new Date(res.body.premiumUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it('DELETE /api/admin/users/:id/api-keys/:keyId revokes a specific API key', async () => {
    const res = await request(app)
      .delete(`/api/admin/users/${regularUser._id}/api-keys/key_123`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.apiKeys.find((k) => k.keyId === 'key_123')).toBeUndefined();
  });

  it('POST /api/admin/users/:id/suspend revokes tokens and rejects subsequent user requests', async () => {
    // Before suspension, user /api/user/me should succeed
    const beforeRes = await request(app)
      .get('/api/user/me')
      .set('Authorization', `Bearer ${regularUserToken}`);
    expect(beforeRes.status).toBe(200);

    // Suspend user
    const suspendRes = await request(app)
      .post(`/api/admin/users/${regularUser._id}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Terms of service violation' });

    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.status).toBe('suspended');

    // After suspension, user /api/user/me must be rejected with 401 or 403
    const afterRes = await request(app)
      .get('/api/user/me')
      .set('Authorization', `Bearer ${regularUserToken}`);
    expect([401, 403]).toContain(afterRes.status);
  });

  it('GET /api/admin/users/export streams CSV format', async () => {
    const res = await request(app)
      .get('/api/admin/users/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain('ID,Email,Status,IsPremium,PremiumUntil,CreatedAt');
    expect(res.text).toContain('client@example.com');
  });
});

describe('Task 3: Payments Ledger and Webhook Audit API', () => {
  it('GET /api/admin/payments lists payment records', async () => {
    const res = await request(app)
      .get('/api/admin/payments?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.payments).toBeInstanceOf(Array);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/admin/payments/stats returns MRR, conversion, and expiring counts', async () => {
    const res = await request(app)
      .get('/api/admin/payments/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('mrr');
    expect(res.body).toHaveProperty('conversionRate');
    expect(res.body).toHaveProperty('expiringIn7Days');
    expect(res.body).toHaveProperty('newPremiumThisWeek');
  });

  it('GET /api/admin/payments/webhooks returns logged webhook events', async () => {
    const res = await request(app)
      .get('/api/admin/payments/webhooks')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.logs).toBeInstanceOf(Array);
    expect(res.body.logs.length).toBeGreaterThan(0);
  });

  it('POST /api/admin/payments/reconcile manually reconciles an unpaid or pending transaction', async () => {
    const pendingPayment = await Payment.create({
      userId: regularUser._id,
      userEmail: regularUser.email,
      provider: 'nowpayments',
      orderId: 'NP_PENDING_99',
      paymentId: 'PAY_99',
      amount: 4.99,
      status: 'waiting',
      durationDays: 30,
    });

    const res = await request(app)
      .post('/api/admin/payments/reconcile')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ paymentId: pendingPayment._id, grantDays: 30, note: 'Manual bank transfer confirmed' });

    expect(res.status).toBe(200);
    expect(res.body.payment.reconciled).toBe(true);
    expect(res.body.payment.status).toBe('finished');
  });
});
