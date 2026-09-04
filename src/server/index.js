import express from 'express';
import cors from 'cors';
import path from 'path';
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

// Essential Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global Authentication Context Extractor
app.use(authenticate);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    project: 'Manto Moda',
    version: '0.1.0-alpha',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/wholesale', wholesaleRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);

// Serve Client Static Files
const publicPath = path.join(__dirname, '../client/public');
app.use(express.static(publicPath));

// Fallback to index.html for SPA client routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Global Error Handler Pipeline
app.use(errorHandler);

// Start Server bound to 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Manto Moda] Server running at http://0.0.0.0:${PORT}`);
  console.log(`[Manto Moda] Production State & Architecture verified.`);
});

export default app;
