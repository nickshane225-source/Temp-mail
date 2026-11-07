import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import userRoutes, { handleStripeWebhook } from './routes/user.js';
import v1Routes from './routes/v1.js';
import { Post, getSettings } from './models.js';

const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://challenges.cloudflare.com',
          'https://apis.google.com',
          'https://www.gstatic.com',
          'https://*.firebaseapp.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'cid:', 'https:', 'http:'],
        connectSrc: [
          "'self'",
          'https://identitytoolkit.googleapis.com',
          'https://securetoken.google.com',
          'https://api.nowpayments.io',
          'https://challenges.cloudflare.com',
          'https://*.firebaseio.com',
          'https://*.googleapis.com',
        ],
        frameSrc: [
          "'self'",
          'https://challenges.cloudflare.com',
          'https://*.firebaseapp.com',
          'https://*.google.com',
        ],
        fontSrc: ["'self'", 'data:', 'https:', 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: false,
  })
);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : null;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || !allowedOrigins || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Api-Key',
      'x-mailbox-token',
      'x-inbound-secret',
      'cf-turnstile-response',
    ],
  })
);
// Mount Stripe webhook with raw body parser before express.json
app.post('/api/user/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);
app.use('/api/inbound', express.json({ limit: '10mb' }));
app.use(express.json({ limit: '100kb' }));
app.use('/api/admin', adminRoutes);

// Maintenance Mode middleware for public & user endpoints
app.use(async (req, res, next) => {
  try {
    const settings = await getSettings();
    if (settings.maintenanceMode) {
      return res.status(503).json({ error: 'System is currently undergoing maintenance. Please try again soon.' });
    }
  } catch {}
  next();
});

app.use('/api/user', userRoutes);
app.use('/api/v1', v1Routes);
app.use('/api', publicRoutes);

// Root level sitemap.xml, robots.txt, and Google AdSense ads.txt
app.get('/sitemap.xml', (_req, res) => res.redirect('/api/sitemap.xml'));
app.get('/robots.txt', (_req, res) => res.redirect('/api/robots.txt'));
app.get('/ads.txt', async (_req, res) => {
  try {
    const settings = await getSettings();
    const content = settings.adsTxt || 'google.com, pub-1052993488526571, DIRECT, f08c47fec0942fa0';
    res.type('text/plain').send(content.trim() + '\n');
  } catch {
    res.type('text/plain').send('google.com, pub-1052993488526571, DIRECT, f08c47fec0942fa0\n');
  }
});

// Return clean JSON error for body-too-large and malformed payloads
app.use((err, _req, res, next) => {
  if (err && (err.status === 413 || err.type === 'entity.too.large')) {
    return res.status(413).json({ error: 'Payload too large' });
  }
  if (err) {
    return res.status(err.status || 400).json({ error: err.message || 'Bad request' });
  }
  next();
});

const candidateDists = [
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist'),
  path.join(process.cwd(), 'frontend/dist'),
  path.join(process.cwd(), 'dist'),
];
const dist = candidateDists.find((d) => fs.existsSync(d)) || candidateDists[0];

if (fs.existsSync(dist)) {
  app.use(
    express.static(dist, {
      maxAge: '1y',
      immutable: true,
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    })
  );

  app.get('*', async (req, res, next) => {
    try {
      // Never return index.html for missing static files (CSS, JS, images, fonts, maps)
      if (req.path.startsWith('/assets/') || /\.[a-zA-Z0-9]+$/.test(req.path)) {
        return res.status(404).send('Asset not found');
      }

      const indexPath = path.join(dist, 'index.html');
      if (!fs.existsSync(indexPath)) return res.sendStatus(404);

      let html = fs.readFileSync(indexPath, 'utf8');

      // Dynamic Server-Side Meta Tag Injection for Blog URLs
      if (req.path.startsWith('/blog/')) {
        const slug = req.path.replace(/^\/blog\//, '').split('/')[0].toLowerCase().trim();
        const post = await Post.findOne({ slug, published: true }).lean().catch(() => null);
        if (post) {
          const title = `${post.title} | TempMail Blog`;
          const desc = post.metaDescription || post.body.slice(0, 160).replace(/\s+/g, ' ');
          const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

          html = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);
          html = html.replace(
            /<meta name="description" content=".*?" \/>/i,
            `<meta name="description" content="${desc}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${desc}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="article" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${desc}" />`
          );
        }
      }

      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(html);
    } catch (err) {
      next(err);
    }
  });
}

export default app;
