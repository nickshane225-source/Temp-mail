import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import app from '../src/app.js';
import { Domain, Mailbox, Message, Admin, Setting, User, Post, Blocklist, Report, AuditLog } from '../src/models.js';

process.env.JWT_SECRET = 'super_secret_jwt_key_that_is_at_least_32_characters_long';
process.env.INBOUND_SECRET = 'tempmail_secret_2026';
process.env.ADMIN_EMAIL = 'admin@tempmail.com';
process.env.ADMIN_PASSWORD = 'adminpassword123';

const results = [];

function logTest(name, passed, details) {
  results.push({ name, passed, details });
  console.log(`${passed ? '✓ PASS' : '✗ FAIL'}: ${name} - ${details}`);
}

async function run() {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  // Setup seed data
  await Domain.create({ name: 'testdomain.com', active: true, isDefault: true });
  const hashedAdminPass = await bcrypt.hash('adminpassword123', 10);
  const admin = await Admin.create({
    email: 'admin@tempmail.com',
    password: hashedAdminPass,
    role: 'owner',
  });

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Create a mailbox
    const resCreate = await fetch(`${baseUrl}/api/mailbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: 'testdomain.com' }),
    });
    const createData = await resCreate.json();
    logTest(
      'POST /api/mailbox',
      resCreate.status === 200 && !!createData.address && !!createData.token,
      `Status: ${resCreate.status}, Address: ${createData.address}`
    );

    const mailboxAddress = createData.address;
    const mailboxToken = createData.token;

    // 2. List messages (initially empty)
    const resList = await fetch(`${baseUrl}/api/mailbox/${mailboxAddress}/messages`, {
      headers: { 'x-mailbox-token': mailboxToken },
    });
    const listData = await resList.json();
    logTest(
      'GET /api/mailbox/:address/messages (with token)',
      resList.status === 200 && Array.isArray(listData.messages) && listData.messages.length === 0,
      `Status: ${resList.status}, Count: ${listData.messages?.length}`
    );

    // List messages without token -> 401
    const resListNoToken = await fetch(`${baseUrl}/api/mailbox/${mailboxAddress}/messages`);
    logTest(
      'GET /api/mailbox/:address/messages (without token)',
      resListNoToken.status === 401,
      `Status: ${resListNoToken.status}`
    );

    // 3. Inbound tests
    // 3a. Inbound with no secret -> 401
    const resInboundNoSec = await fetch(`${baseUrl}/api/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: mailboxAddress, from: 'sender@example.com', subject: 'Test' }),
    });
    logTest(
      'POST /api/inbound (no secret)',
      resInboundNoSec.status === 401,
      `Status: ${resInboundNoSec.status}`
    );

    // 3b. Inbound with wrong secret -> 401
    const resInboundWrongSec = await fetch(`${baseUrl}/api/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-inbound-secret': 'wrong_secret' },
      body: JSON.stringify({ to: mailboxAddress, from: 'sender@example.com', subject: 'Test' }),
    });
    logTest(
      'POST /api/inbound (wrong secret)',
      resInboundWrongSec.status === 401,
      `Status: ${resInboundWrongSec.status}`
    );

    // 3c. Inbound with unknown mailbox -> 404
    const resInboundUnknown = await fetch(`${baseUrl}/api/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-inbound-secret': 'tempmail_secret_2026' },
      body: JSON.stringify({ to: 'unknown_box_123@testdomain.com', from: 'sender@example.com', subject: 'Test' }),
    });
    logTest(
      'POST /api/inbound (unknown mailbox)',
      resInboundUnknown.status === 404,
      `Status: ${resInboundUnknown.status}`
    );

    // 3d. Inbound with oversized body -> 413
    const hugeBody = 'x'.repeat(3 * 1024 * 1024); // 3MB (limit is 2MB)
    const resInboundOversized = await fetch(`${baseUrl}/api/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-inbound-secret': 'tempmail_secret_2026' },
      body: JSON.stringify({ to: mailboxAddress, from: 'sender@example.com', raw: hugeBody }),
    });
    logTest(
      'POST /api/inbound (oversized body)',
      resInboundOversized.status === 413,
      `Status: ${resInboundOversized.status}`
    );

    // 3e. Inbound with correct secret & existing mailbox -> 200
    const resInboundSuccess = await fetch(`${baseUrl}/api/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-inbound-secret': 'tempmail_secret_2026' },
      body: JSON.stringify({
        to: mailboxAddress,
        from: 'service@github.com',
        subject: 'Your GitHub verification code is 482910',
        text: 'Enter code 482910 to verify your account.',
        html: '<p>Your verification code is <strong>482910</strong></p>',
      }),
    });
    const inboundData = await resInboundSuccess.json();
    logTest(
      'POST /api/inbound (correct secret & existing mailbox)',
      resInboundSuccess.status === 200 && !!inboundData.id,
      `Status: ${resInboundSuccess.status}, MessageId: ${inboundData.id}`
    );

    const messageId = inboundData.id;

    // 4. Read message
    const resRead = await fetch(`${baseUrl}/api/mailbox/${mailboxAddress}/messages/${messageId}`, {
      headers: { 'x-mailbox-token': mailboxToken },
    });
    const readData = await resRead.json();
    logTest(
      'GET /api/mailbox/:address/messages/:id (read message)',
      resRead.status === 200 && readData.subject?.includes('482910') && readData.codes?.includes('482910'),
      `Status: ${resRead.status}, Extracted codes: ${JSON.stringify(readData.codes)}`
    );

    // 5. Extend mailbox
    const resExtend = await fetch(`${baseUrl}/api/mailbox/${mailboxAddress}/extend`, {
      method: 'POST',
      headers: { 'x-mailbox-token': mailboxToken },
    });
    const extendData = await resExtend.json();
    logTest(
      'POST /api/mailbox/:address/extend',
      resExtend.status === 200 && !!extendData.expiresAt,
      `Status: ${resExtend.status}, New Expiry: ${extendData.expiresAt}`
    );

    // 6. Delete message
    const resDel = await fetch(`${baseUrl}/api/mailbox/${mailboxAddress}/messages/${messageId}`, {
      method: 'DELETE',
      headers: { 'x-mailbox-token': mailboxToken },
    });
    const delData = await resDel.json();
    logTest(
      'DELETE /api/mailbox/:address/messages/:id',
      resDel.status === 200 && delData.ok === true,
      `Status: ${resDel.status}`
    );

    // 7. Admin Authentication Tests
    // 7a. Admin login wrong credentials -> 401
    const resAdminWrong = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@tempmail.com', password: 'wrongpassword' }),
    });
    logTest(
      'POST /api/admin/login (wrong password)',
      resAdminWrong.status === 401,
      `Status: ${resAdminWrong.status}`
    );

    // 7b. Admin login right credentials -> 200 with token
    const resAdminRight = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@tempmail.com', password: 'adminpassword123' }),
    });
    const adminData = await resAdminRight.json();
    logTest(
      'POST /api/admin/login (right credentials)',
      resAdminRight.status === 200 && !!adminData.token,
      `Status: ${resAdminRight.status}, Role: ${adminData.admin?.role}`
    );

    const adminToken = adminData.token;

    // 8. Test every admin endpoint with and without token
    const adminEndpoints = [
      { path: '/api/admin/stats', method: 'GET' },
      { path: '/api/admin/domains', method: 'GET' },
      { path: '/api/admin/messages', method: 'GET' },
      { path: '/api/admin/settings', method: 'GET' },
      { path: '/api/admin/users', method: 'GET' },
      { path: '/api/admin/posts', method: 'GET' },
      { path: '/api/admin/blocklist', method: 'GET' },
      { path: '/api/admin/reports', method: 'GET' },
      { path: '/api/admin/audit', method: 'GET' },
      { path: '/api/admin/failures', method: 'GET' },
      { path: '/api/admin/backups/export', method: 'GET' },
      { path: '/api/admin/2fa/status', method: 'GET' },
    ];

    for (const ep of adminEndpoints) {
      // Without token -> 401
      const resWithout = await fetch(`${baseUrl}${ep.path}`, { method: ep.method });
      logTest(
        `${ep.method} ${ep.path} (without token)`,
        resWithout.status === 401,
        `Status: ${resWithout.status}`
      );

      // With token -> 200
      const resWith = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      logTest(
        `${ep.method} ${ep.path} (with token)`,
        resWith.status === 200,
        `Status: ${resWith.status}`
      );
    }
  } finally {
    server.close();
    await mongoose.disconnect();
    await mongo.stop();
  }

  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`\nCURL / HTTP Endpoint Audit Summary: ${results.length - failedCount}/${results.length} PASSED.`);
}

run().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
