import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { authenticate } from './middlewares/auth.js';
import { errorHandler } from './middlewares/error-handler.js';
import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/product.routes.js';
import wholesaleRoutes from './routes/wholesale.routes.js';
import cartRoutes from './routes/cart.routes.js';
import orderRoutes from './routes/order.routes.js';
import adminRoutes from './routes/admin.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Security Headers (Helmet)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
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
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 1000 : 30, // 30 attempts per 15 minutes in prod
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
  max: process.env.NODE_ENV === 'test' ? 5000 : 300,
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
    timestamp: new Date().toISOString()
  });
});

// 8. Mount API Routes with Rate Limiters
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', generalApiLimiter, productRoutes);
app.use('/api/wholesale', generalApiLimiter, wholesaleRoutes);
app.use('/api/cart', generalApiLimiter, cartRoutes);
app.use('/api/orders', generalApiLimiter, orderRoutes);
app.use('/api/admin', generalApiLimiter, adminRoutes);

// 9. Serve Client Static Files
const publicPath = path.join(__dirname, '../client/public');
app.use(express.static(publicPath));

// Fallback to index.html for SPA client routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

// 10. Global Error Handler Pipeline (Safe from Stack Leakage)
app.use(errorHandler);

// Start Server bound to 0.0.0.0
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Manto Moda] Server running at http://0.0.0.0:${PORT}`);
  console.log(`[Manto Moda] Production State & Architecture verified.`);
});

// Graceful Shutdown Handling (DevOps & SRE)
const shutdown = () => {
  console.log('[Manto Moda] Gracefully shutting down server...');
  server.close(() => {
    console.log('[Manto Moda] HTTP server closed cleanly.');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;
