import { Router } from 'express';
import { db } from '../db/store.js';
import { priceSanitizerMiddleware } from '../middlewares/price-sanitizer.js';

const router = Router();

// Apply price sanitizer middleware to ensure Wholesale price protection on all public product routes
router.use(priceSanitizerMiddleware);

// Get Product Categories
router.get('/categories', (req, res) => {
  const categories = db.listCategories();
  res.json({
    success: true,
    data: categories
  });
});

// List Products with Filters + Pagination (ADR-014)
// Why pagination: shipping the whole catalog in one response does not survive
// growth — 500 products on a weak mobile connection is several megabytes.
// Defaults: page 1, 12 items. Maximum page size is 60 to keep responses bounded.
router.get('/', (req, res) => {
  const { category, search, season, minPrice, maxPrice, sort, page, limit } = req.query;

  const paginated = page !== undefined || limit !== undefined;

  let products = db.listProducts(
    paginated
      ? { category, search, season, minPrice, maxPrice, page, limit }
      : { category, search, season, minPrice, maxPrice }
  );

  let items = paginated ? products.items : products;
  const meta = paginated
    ? products.meta
    : { page: 1, limit: items.length, total: items.length, totalPages: 1, hasMore: false };

  // Sorting
  if (sort === 'price-asc') {
    items.sort((a, b) => a.retailPrice - b.retailPrice);
  } else if (sort === 'price-desc') {
    items.sort((a, b) => b.retailPrice - a.retailPrice);
  } else if (sort === 'rating') {
    items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else {
    // Default featured/newest
    items.sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0));
  }

  res.json({
    success: true,
    data: items,
    count: items.length,
    meta
  });
});

// Get Single Product Detail
router.get('/:id', (req, res) => {
  const product = db.findProductById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      error: 'PRODUCT_NOT_FOUND',
      message: 'محصول مورد نظر یافت نشد.'
    });
  }

  res.json({
    success: true,
    data: product
  });
});

export default router;
