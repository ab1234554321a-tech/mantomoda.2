// =============================================================================
//  Express application factory — NO network listening here.
//
//  Kept separate from index.js so automated tests can drive the real HTTP stack
//  (supertest) without opening a port, and so the server can later be mounted
//  in a different runtime (e.g. serverless) without touching routes.
// =============================================================================
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';

import { authenticate } from './middlewares/auth.js';
import { errorHandler } from './middlewares/error-handler.js';
import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/product.routes.js';
import wholesaleRoutes from './routes/wholesale.routes.js';
import cartRoutes from './routes/cart.routes.js';
import orderRoutes from './routes/order.routes.js';
import adminRoutes from './routes/admin.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import seoRoutes from './routes/seo.routes.js';
import invoiceRoutes, { publicInvoiceRouter } from './routes/invoice.routes.js';
import { auditAdminWrite } from './middlewares/admin-audit.js';
import uploadRoutes from './routes/upload.routes.js';
import { uploadsDir } from './db/persistence.js';
import { db } from './db/store.js';

import { publicPath, indexHtmlPath } from './paths.js';

export { publicPath };

export function createApp() {
  const app = express();

  // Do not advertise the framework.
  app.disable('x-powered-by');

  // 1. Security Headers (Helmet)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
        connectSrc: ["'self'"],
        // Configurable so the app can be embedded in staging/preview iframes.
        // Default remains restrictive ('self'); production must NOT widen this.
        // Example: CSP_FRAME_ANCESTORS="https://panel.example.com,https://admin.example.com"
        frameAncestors: process.env.CSP_FRAME_ANCESTORS
          ? process.env.CSP_FRAME_ANCESTORS.split(',').map((s) => s.trim()).filter(Boolean)
          : ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    // X-Frame-Options duplicates the CSP frame-ancestors policy and would block
    // trusted embedding even after CSP is widened, so it is disabled only when
    // CSP_FRAME_ANCESTORS is explicitly configured. Default stays SAMEORIGIN.
    frameguard: process.env.CSP_FRAME_ANCESTORS ? false : { action: 'sameorigin' }
  }));

  // 2. CORS Configuration
  app.use(cors({
    origin: true,
    credentials: true
  }));

  // 3. Body Parsers with payload size limits (DoS Prevention)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 4. SRE & Observability: Request ID and Request Duration Logging
  app.use((req, res, next) => {
    const reqId = req.headers['x-request-id'] || `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    req.id = reqId;
    res.setHeader('X-Request-Id', reqId);

    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (req.path.startsWith('/api')) {
        console.log(`[HTTP] ${req.method} ${req.path} -> Status: ${res.statusCode} (${duration}ms) [ReqID: ${reqId}]`);
      }
    });

    next();
  });

  // 5. Rate Limiting (Brute-Force & Abuse Mitigation)
  const isTest = process.env.NODE_ENV === 'test';

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isTest ? 1000 : 30, // 30 attempts per 15 minutes in prod
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'تعداد درخواست‌های احراز هویت بیش از حد مجاز است. لطفاً ۱۵ دقیقه دیگر مجدداً تلاش کنید.'
    }
  });

  const generalApiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: isTest ? 5000 : 300,
    standardHeaders: true,
    legacyHeaders: false
  });

  // 6. Global Authentication Context Extractor (HMAC-SHA256 JWT)
  app.use(authenticate);

  // 7. Health & Observability Endpoint
  app.get('/api/health', (req, res) => {
    const memoryUsage = process.memoryUsage();
    res.json({
      status: 'healthy',
      project: 'Manto Moda',
      version: '0.3.0-rc1',
      environment: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memoryUsage.rss / 1024 / 1024)
      },
      persistence: db.persistenceInfo(),
      timestamp: new Date().toISOString()
    });
  });

  // 8. Mount API Routes with Rate Limiters
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/products', generalApiLimiter, productRoutes);
  app.use('/api/wholesale', generalApiLimiter, wholesaleRoutes);
  app.use('/api/cart', generalApiLimiter, cartRoutes);
  app.use('/api/orders', generalApiLimiter, orderRoutes);
  app.use('/api/payments', generalApiLimiter, paymentRoutes);
  // Every mutating admin request is audited (ADR-020) before it hits a route.
  app.use('/api/admin', generalApiLimiter, auditAdminWrite, adminRoutes);
  app.use('/api/admin', generalApiLimiter, auditAdminWrite, uploadRoutes);
  app.use('/api', generalApiLimiter, invoiceRoutes);

  // 9. Uploaded product images (content-addressed files on disk)
  app.use('/uploads', express.static(uploadsDir(), {
    maxAge: '30d',
    immutable: true,
    index: false,
    dotfiles: 'deny'
  }));

  // 10. SEO: robots.txt, sitemap.xml and the pre-rendered product page
  app.use('/', seoRoutes);

  // 10.b Signed, printable invoice page (no login needed, expiring link)
  app.use('/', publicInvoiceRouter);

  // 11. Serve Client Static Files
  app.use(express.static(publicPath));

  // Fallback to index.html for SPA client routing
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(indexHtmlPath);
  });

  // 12. Global Error Handler Pipeline (Safe from Stack Leakage)
  app.use(errorHandler);

  return app;
}

export default createApp;
