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

// List Products with Filters
router.get('/', (req, res) => {
  const { category, search, season, minPrice, maxPrice, sort } = req.query;

  let products = db.listProducts({ category, search, season, minPrice, maxPrice });

  // Sorting
  if (sort === 'price-asc') {
    products.sort((a, b) => a.retailPrice - b.retailPrice);
  } else if (sort === 'price-desc') {
    products.sort((a, b) => b.retailPrice - a.retailPrice);
  } else if (sort === 'rating') {
    products.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else {
    // Default featured/newest
    products.sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0));
  }

  res.json({
    success: true,
    data: products,
    count: products.length
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
