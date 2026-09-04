/**
 * Price Sanitizer Utility & Middleware
 * 
 * Enforces Architectural Decision ADR-003:
 * "UI Security != Real Security"
 * Wholesale prices, margin metadata, and bulk thresholds are completely stripped
 * from response payloads for guest and regular retail customers.
 */

export function sanitizeProductForUser(product, user) {
  if (!product) return null;

  const isAuthorized = user && (
    user.role === 'ADMIN' || 
    (user.role === 'WHOLESALE' && user.isWholesaleVerified === true)
  );

  const cleanProduct = { ...product };

  if (!isAuthorized) {
    // Strip wholesale prices completely
    delete cleanProduct.wholesalePrice;
    delete cleanProduct.wholesaleMinQuantity;
    delete cleanProduct.wholesaleMargin;
  }

  return cleanProduct;
}

export function sanitizeProductListForUser(products, user) {
  if (!Array.isArray(products)) return [];
  return products.map(product => sanitizeProductForUser(product, user));
}

// Express middleware that can be applied to routes or responses
export function priceSanitizerMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function (data) {
    if (data && data.success && data.data) {
      if (Array.isArray(data.data)) {
        data.data = sanitizeProductListForUser(data.data, req.user);
      } else if (typeof data.data === 'object' && (data.data.retailPrice !== undefined || data.data.wholesalePrice !== undefined)) {
        data.data = sanitizeProductForUser(data.data, req.user);
      }
    }
    return originalJson(data);
  };

  next();
}
