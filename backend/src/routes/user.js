import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import rateLimit from 'express-rate-limit';
import { User, Payment, WebhookLog } from '../models.js';
import { verifyFirebaseIdToken } from '../utils/firebase.js';

const r = Router();
const userAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

function signUserToken(user) {
  return jwt.sign(
    { userId: user._id, email: user.email, isPremium: user.isPremium },
    process.env.JWT_SECRET || 'dev-secret-change-me',
    { expiresIn: '30d' }
  );
}

// User JWT verification middleware with immediate suspension/revocation check
export async function requireUserAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-me');
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User session invalid' });
    }

    if (user.status === 'suspended' || user.status === 'banned') {
      return res.status(403).json({
        error: `Account has been ${user.status}. Reason: ${user.suspendedReason || 'Administrative decision'}`,
      });
    }

    if (user.tokenRevokedAt && decoded.iat && (decoded.iat * 1000) < new Date(user.tokenRevokedAt).getTime()) {
      return res.status(401).json({ error: 'Session has been revoked. Please sign in again.' });
    }

    req.userId = user._id;
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }
}

// Register
r.post('/register', userAuthLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Valid email and a password of at least 6 characters are required.' });
  }

  const cleanEmail = String(email).toLowerCase().trim();
  const existing = await User.findOne({ email: cleanEmail });
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await User.create({ email: cleanEmail, password: hashedPassword });
  const token = signUserToken(user);

  res.json({
    token,
    user: {
      email: user.email,
      isPremium: user.isPremium,
      premiumUntil: user.premiumUntil,
    },
  });
});

// Login
r.post('/login', userAuthLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').toLowerCase().trim();
  const user = await User.findOne({ email: cleanEmail });

  if (!user || !(await bcrypt.compare(String(password || ''), user.password))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.status === 'suspended' || user.status === 'banned') {
    return res.status(403).json({
      error: `Your account is ${user.status}. Reason: ${user.suspendedReason || 'Administrative decision'}`,
    });
  }

  user.lastLoginAt = new Date();
  user.lastLoginIp = req.headers['cf-connecting-ip'] || req.ip;

  // Check if premium period has expired
  if (user.isPremium && user.premiumUntil && new Date(user.premiumUntil) < new Date()) {
    user.isPremium = false;
  }
  await user.save();

  const token = signUserToken(user);
  res.json({
    token,
    user: {
      email: user.email,
      isPremium: user.isPremium,
      premiumUntil: user.premiumUntil,
    },
  });
});

// Firebase Authentication (Login or Auto-Register)
r.post('/firebase', userAuthLimiter, async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) {
    return res.status(400).json({ error: 'Firebase ID token is required.' });
  }

  try {
    const verified = await verifyFirebaseIdToken(idToken);
    if (!verified.email) {
      return res.status(400).json({ error: 'Firebase token did not contain a valid email address.' });
    }

    const cleanEmail = verified.email.toLowerCase().trim();
    let user = await User.findOne({
      $or: [{ firebaseUid: verified.uid }, { email: cleanEmail }],
    });

    if (!user) {
      user = await User.create({
        email: cleanEmail,
        firebaseUid: verified.uid,
      });
    } else if (!user.firebaseUid) {
      user.firebaseUid = verified.uid;
      await user.save();
    }

    if (user.isPremium && user.premiumUntil && new Date(user.premiumUntil) < new Date()) {
      user.isPremium = false;
      await user.save();
    }

    const token = signUserToken(user);
    res.json({
      token,
      user: {
        email: user.email,
        isPremium: !!user.isPremium && (!user.premiumUntil || new Date(user.premiumUntil) > new Date()),
        premiumUntil: user.premiumUntil,
      },
    });
  } catch (err) {
    res.status(401).json({ error: err.message || 'Firebase authentication failed.' });
  }
});

// Current user profile
r.get('/me', requireUserAuth, async (req, res) => {
  const user = await User.findById(req.userId).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });

  res.json({
    email: user.email,
    isPremium: !!user.isPremium && (!user.premiumUntil || new Date(user.premiumUntil) > new Date()),
    premiumUntil: user.premiumUntil,
    apiKeys: (user.apiKeys || []).map((k) => ({
      keyId: k.keyId,
      name: k.name,
      prefix: k.prefix,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
    })),
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
    nowpaymentsConfigured: !!process.env.NOWPAYMENTS_API_KEY,
  });
});

// Create API Key (Premium users only)
r.post('/api-keys', requireUserAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const activePremium = user.isPremium && (!user.premiumUntil || new Date(user.premiumUntil) > new Date());
  if (!activePremium) {
    return res.status(403).json({ error: 'API access requires an active Premium subscription.' });
  }

  const name = String(req.body?.name || 'Default Key').trim().slice(0, 50);
  const rawKey = 'tm_' + crypto.randomBytes(24).toString('hex');
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyId = crypto.randomBytes(8).toString('hex');

  user.apiKeys.push({
    keyId,
    name,
    keyHash,
    prefix: rawKey.slice(0, 7),
    createdAt: new Date(),
  });
  await user.save();

  // Return raw key once
  res.json({
    keyId,
    name,
    apiKey: rawKey,
    prefix: rawKey.slice(0, 7),
    message: 'Store your API key securely. It will not be shown again.',
  });
});

// Delete API Key
r.delete('/api-keys/:keyId', requireUserAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.apiKeys = user.apiKeys.filter((k) => k.keyId !== req.params.keyId);
  await user.save();
  res.json({ ok: true });
});

// Stripe Checkout session (if STRIPE_SECRET_KEY is configured)
r.post('/checkout', requireUserAuth, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Stripe payments are not configured on this instance.' });
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const user = await User.findById(req.userId);

    const protocol = req.protocol;
    const host = req.get('host');
    const returnUrl = `${protocol}://${host}/premium?success=true`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: user.email,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      success_url: returnUrl,
      cancel_url: `${protocol}://${host}/premium?canceled=true`,
      metadata: { userId: String(user._id) },
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to initiate checkout.' });
  }
});

// NOWPayments Crypto Checkout Invoice (if NOWPAYMENTS_API_KEY is configured)
r.post('/nowpayments/invoice', requireUserAuth, async (req, res) => {
  const apiKey = process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'NOWPayments crypto gateway is not configured on this instance.' });
  }

  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    const protocol = req.protocol;
    const host = req.get('host');
    const orderId = `tm_${user._id}_${Date.now()}`;

    const payload = {
      price_amount: 4.99,
      price_currency: 'usd',
      order_id: orderId,
      order_description: 'TempMail Premium 1-Month Subscription ($4.99)',
      ipn_callback_url: `${protocol}://${host}/api/user/nowpayments/webhook`,
      success_url: `${protocol}://${host}/premium?success=true&order=${encodeURIComponent(orderId)}`,
      cancel_url: `${protocol}://${host}/premium?canceled=true`,
    };

    const response = await fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || 'Failed to create crypto invoice with NOWPayments.');
    }

    user.nowpaymentsPaymentId = data.id || orderId;
    await user.save();

    await Payment.create({
      userId: user._id,
      userEmail: user.email,
      provider: 'nowpayments',
      orderId,
      paymentId: String(data.id || ''),
      amount: 4.99,
      status: 'waiting',
      durationDays: 30,
    }).catch(() => {});

    res.json({
      invoiceUrl: data.invoice_url || data.invoiceUrl,
      orderId: data.order_id,
      paymentId: data.id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'NOWPayments crypto checkout initialization failed.' });
  }
});

// Payment Status Polling for user activation
r.get('/payment-status', requireUserAuth, async (req, res) => {
  const orderId = String(req.query.order || '').trim();
  if (!orderId) {
    return res.status(400).json({ error: 'Order ID is required' });
  }

  const payment = await Payment.findOne({ orderId });
  if (!payment) {
    return res.status(404).json({ error: 'Payment record not found' });
  }

  // Cross-user authorization check
  const orderBelongsToUser =
    (payment.userId && payment.userId.toString() === req.userId.toString()) ||
    orderId.startsWith(`tm_${req.userId}_`) ||
    orderId.startsWith(`user_${req.userId}_`);

  if (!orderBelongsToUser) {
    return res.status(403).json({ error: 'Unauthorized to view this payment' });
  }

  const currentUser = await User.findById(req.userId);
  const isPrem = !!currentUser?.isPremium && (!currentUser?.premiumUntil || new Date(currentUser.premiumUntil) > new Date());

  res.json({
    status: payment.status,
    isPremium: isPrem,
    premiumUntil: currentUser?.premiumUntil,
    orderId: payment.orderId,
  });
});

// NOWPayments IPN Webhook callback
r.post('/nowpayments/webhook', async (req, res) => {
  const signature = req.headers['x-nowpayments-sig'];
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  let sigStatus = 'processed';
  let sigError = '';

  // In production, require IPN secret and signature
  if (process.env.NODE_ENV === 'production' && !ipnSecret) {
    return res.status(503).json({ error: 'NOWPayments IPN secret is not configured on this server.' });
  }

  if (ipnSecret || process.env.NODE_ENV === 'production') {
    if (!ipnSecret) {
      return res.status(503).json({ error: 'NOWPayments IPN secret is not configured.' });
    }
    if (!signature) {
      return res.status(400).json({ error: 'Missing x-nowpayments-sig header' });
    }

    function sortObject(obj) {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
      return Object.keys(obj).sort().reduce((acc, k) => {
        acc[k] = (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k]))
          ? sortObject(obj[k])
          : obj[k];
        return acc;
      }, {});
    }

    try {
      const sortedPayload = JSON.stringify(sortObject(req.body));
      const expectedSig = crypto
        .createHmac('sha512', ipnSecret)
        .update(sortedPayload)
        .digest('hex');

      const sigBuf = Buffer.from(String(signature), 'hex');
      const expBuf = Buffer.from(expectedSig, 'hex');

      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        sigStatus = 'rejected';
        sigError = 'Invalid NOWPayments IPN signature';
      }
    } catch (e) {
      sigStatus = 'rejected';
      sigError = e.message || 'Signature verification error';
    }
  }

  // Audit webhook callback
  try {
    await WebhookLog.create({
      provider: 'nowpayments',
      event: req.body?.payment_status || 'unknown',
      status: sigStatus,
      signature: String(signature || ''),
      ip: req.headers['cf-connecting-ip'] || req.ip,
      payload: req.body,
      error: sigError,
    });
  } catch {}

  if (sigStatus === 'rejected') {
    return res.status(400).json({ error: sigError });
  }

  try {
    const { payment_status, order_id, payment_id, actually_paid } = req.body || {};
    const query = {
      $or: [
        ...(order_id ? [{ orderId: order_id }] : []),
        ...(payment_id ? [{ paymentId: String(payment_id) }] : []),
      ],
    };

    if (payment_status === 'finished' || payment_status === 'confirmed') {
      let targetUserId = null;
      let shouldGrantPremium = false;
      let durationDays = 30;

      if (query.$or.length > 0) {
        // Atomic find and update that ONLY matches if premiumGranted is not true
        const updatedPayment = await Payment.findOneAndUpdate(
          {
            ...query,
            premiumGranted: { $ne: true },
          },
          {
            premiumGranted: true,
            status: payment_status,
            actuallyPaid: actually_paid,
            rawWebhook: req.body,
          },
          { new: true }
        );

        if (updatedPayment) {
          shouldGrantPremium = true;
          targetUserId = updatedPayment.userId;
          durationDays = updatedPayment.durationDays || 30;
        } else {
          // Either doc exists with premiumGranted: true, or doc does not exist
          const docExists = await Payment.exists(query);
          if (docExists) {
            // Already granted once: update record without granting duplicate days
            await Payment.findOneAndUpdate(query, {
              status: payment_status,
              actuallyPaid: actually_paid,
              rawWebhook: req.body,
            }).catch(() => {});
          } else if (order_id && order_id.startsWith('tm_')) {
            shouldGrantPremium = true;
          }
        }
      } else if (order_id && order_id.startsWith('tm_')) {
        shouldGrantPremium = true;
      }

      if (shouldGrantPremium) {
        if (!targetUserId && order_id && order_id.startsWith('tm_')) {
          const possibleId = order_id.split('_')[1];
          if (possibleId && mongoose.isValidObjectId(possibleId)) {
            targetUserId = possibleId;
          }
        }
        if (targetUserId && mongoose.isValidObjectId(targetUserId)) {
          const user = await User.findById(targetUserId);
          if (user) {
            user.isPremium = true;
            const currentEnd = (user.premiumUntil && new Date(user.premiumUntil) > new Date())
              ? new Date(user.premiumUntil).getTime()
              : Date.now();
            user.premiumUntil = new Date(currentEnd + durationDays * 864e5);
            await user.save();

            // Ensure Payment doc exists and is marked premiumGranted
            if (query.$or.length > 0) {
              await Payment.findOneAndUpdate(
                query,
                {
                  userId: user._id,
                  userEmail: user.email,
                  provider: 'nowpayments',
                  orderId: order_id,
                  paymentId: String(payment_id || ''),
                  amount: actually_paid || 4.99,
                  status: payment_status,
                  premiumGranted: true,
                  rawWebhook: req.body,
                },
                { upsert: true, new: true }
              ).catch(() => {});
            }
          }
        }
      }
    } else if (query.$or.length > 0) {
      await Payment.findOneAndUpdate(query, {
        status: payment_status || 'waiting',
        actuallyPaid: actually_paid,
        rawWebhook: req.body,
      }).catch(() => {});
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook execution error:', err);
    res.status(500).json({ error: 'Webhook execution error' });
  }
});

// Stripe Webhook handler for checkout.session.completed
export async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (endpointSecret && sig && process.env.STRIPE_SECRET_KEY) {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } else {
      event = typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString('utf8'))
        : req.body;
    }
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event?.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const email = session.customer_email || session.customer_details?.email;

    try {
      await WebhookLog.create({
        provider: 'stripe',
        event: 'checkout.session.completed',
        status: 'processed',
        signature: String(sig || ''),
        ip: req.headers['cf-connecting-ip'] || req.ip,
        payload: session,
      });

      await Payment.create({
        userId: userId || undefined,
        userEmail: email ? String(email).toLowerCase() : undefined,
        provider: 'stripe',
        orderId: session.id,
        paymentId: session.payment_intent || session.id,
        amount: (session.amount_total || 499) / 100,
        currency: (session.currency || 'usd').toUpperCase(),
        status: 'finished',
        durationDays: 30,
        rawWebhook: session,
      });
    } catch {}

    const query = userId ? { _id: userId } : (email ? { email: String(email).toLowerCase() } : null);
    if (query) {
      const user = await User.findOne(query);
      if (user) {
        user.isPremium = true;
        user.premiumUntil = new Date(Date.now() + 30 * 864e5); // 30 days
        await user.save();
      }
    }
  }

  res.json({ received: true });
}

export default r;
