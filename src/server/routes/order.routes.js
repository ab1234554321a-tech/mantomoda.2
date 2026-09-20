import { calculateOrderTotals } from '../services/pricing/shipping.service.js';
import { evaluateCoupon } from '../services/pricing/coupon.service.js';
import { checkLowStockAfterSale } from '../services/inventory-alert.service.js';
import { Router } from 'express';
import { db } from '../db/store.js';
import { requireAuth } from '../middlewares/auth.js';
import { validate, orderCheckoutSchema } from '../middlewares/validate.js';
import { notifyOrderPlaced } from '../services/notification.service.js';

const router = Router();

// Create Order (Checkout) with Server-Side Recalculation & Schema Validation
router.post('/', requireAuth, validate(orderCheckoutSchema), (req, res) => {
  const { items, shippingAddress, paymentMethod, couponCode } = req.body;

  const isWholesaleUser = req.user.role === 'ADMIN' || (req.user.role === 'WHOLESALE' && req.user.isWholesaleVerified === true);

  // --- Inventory gate (ADR-011): never sell what is not in stock ---
  // Validated here, before any price math, so the customer gets a precise
  // "which item, how many are left" answer instead of a generic failure.
  const stockCheck = db.checkStock(items);
  if (!stockCheck.ok) {
    return res.status(409).json({
      success: false,
      error: 'INSUFFICIENT_STOCK',
      message: 'موجودی برخی اقلام سبد خرید کافی نیست. لطفاً تعداد را اصلاح کنید.',
      shortages: stockCheck.shortages
    });
  }

  // Recalculate price strictly on server (Anti-Tampering ADR-003)
  let subtotal = 0;
  let hasWholesaleItem = false;
  const orderItems = [];

  for (const item of items) {
    const product = db.findProductById(item.productId);
    if (!product || !product.isActive) {
      return res.status(400).json({
        success: false,
        error: 'PRODUCT_UNAVAILABLE',
        message: `محصول «${item.productId}» در حال حاضر در دسترس نیست یا غیرفعال است.`
      });
    }

    const variant = (product.variants || []).find(v => v.id === item.variantId) || product.variants[0];
    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);

    let unitPrice = product.retailPrice;
    if (isWholesaleUser && qty >= (product.wholesaleMinQuantity || 6)) {
      unitPrice = product.wholesalePrice;
      hasWholesaleItem = true;
    }

    const lineTotal = unitPrice * qty;
    subtotal += lineTotal;

    orderItems.push({
      productId: product.id,
      productTitle: product.title,
      variantId: variant ? variant.id : null,
      color: variant ? variant.color : '',
      size: variant ? variant.size : '',
      quantity: qty,
      unitPrice,
      totalPrice: lineTotal
    });
  }

  // --- Discount + shipping + payable, all server-side (ADR-017 / ADR-018) ---
  // The client may have shown a preview, but the numbers that matter are the
  // ones computed here from the stored basket.
  let couponResult = null;
  if (couponCode) {
    couponResult = evaluateCoupon({
      code: couponCode,
      subtotal,
      user: req.user,
      orderType: hasWholesaleItem ? 'WHOLESALE' : 'RETAIL'
    });

    if (!couponResult.ok && couponResult.reason !== 'ZERO_DISCOUNT') {
      return res.status(422).json({
        success: false,
        error: 'COUPON_REJECTED',
        message: couponResult.message,
        reason: couponResult.reason
      });
    }
  }

  const totals = calculateOrderTotals({
    subtotal,
    discount: couponResult?.ok ? couponResult.discount : 0,
    province: shippingAddress?.province || '',
    isWholesale: isWholesaleUser
  });

  // --- Atomic reservation (ADR-011) ---
  // The cart stock check above is advisory; this is the authoritative lock.
  // There is no `await` between validation and decrement, so Node's single
  // thread guarantees two simultaneous checkouts cannot oversell the same item.
  const reservation = db.reserveStock(items);
  if (!reservation.ok) {
    return res.status(409).json({
      success: false,
      error: 'INSUFFICIENT_STOCK',
      message: 'موجودی برخی اقلام در همین لحظه تغییر کرد و کافی نیست. لطفاً سبد خرید را بازبینی کنید.',
      shortages: reservation.shortages
    });
  }

  const order = db.createOrder({
    userId: req.user.id,
    userFullName: req.user.fullName,
    userEmail: req.user.email,
    userPhone: req.user.phone || '',
    orderType: hasWholesaleItem ? 'WHOLESALE' : 'RETAIL',
    items: orderItems,
    totalAmount: subtotal,
    discountAmount: totals.discountAmount,
    couponCode: couponResult?.ok ? couponResult.code : null,
    shippingFee: totals.shippingFee,
    shippingSource: totals.shipping.source,
    payableAmount: totals.payableAmount,
    paymentMethod: paymentMethod || 'ONLINE_GATEWAY',
    stockReserved: true,
    shippingAddress
  });

  // A successful checkout finally burns one unit of the coupon's capacity.
  if (couponResult?.ok) {
    db.registerCouponUsage(couponResult.code);
    order.couponCode = couponResult.code;
    order.discountAmount = totals.discountAmount;
  }

  // Order-received SMS (ADR-012). Never blocks or fails the checkout.
  notifyOrderPlaced(order);

  // Post-sale inventory alert to the owner (ADR-019) — fire and forget.
  checkLowStockAfterSale(order.items).catch(() => { /* logged inside */ });

  res.status(201).json({
    success: true,
    data: order,
    message: `سفارش شما با شناسه ${order.orderNumber} با موفقیت ثبت شد.`
  });
});

// Get My Orders
router.get('/my-orders', requireAuth, (req, res) => {
  const orders = db.findOrdersByUserId(req.user.id);
  res.json({
    success: true,
    data: orders
  });
});

// Get Order Details with Strict Ownership Access Control (IDOR / BOLA Prevention)
router.get('/:id', requireAuth, (req, res) => {
  const order = db.findOrderById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      error: 'ORDER_NOT_FOUND',
      message: 'سفارش مورد نظر یافت نشد.'
    });
  }

  // Security: Check resource ownership (BOLA / IDOR protection)
  if (order.userId !== req.user.id && req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'شما دسترسی مجاز برای مشاهده این سفارش را ندارید.'
    });
  }

  res.json({
    success: true,
    data: order
  });
});

export default router;
