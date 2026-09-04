import { Router } from 'express';
import { db } from '../db/store.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// Create Order (Checkout)
router.post('/', requireAuth, (req, res) => {
  const { items, shippingAddress, paymentMethod } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'EMPTY_CART',
      message: 'سبد خرید شما خالی است.'
    });
  }

  if (!shippingAddress || !shippingAddress.recipientName || !shippingAddress.phone || !shippingAddress.fullAddress) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_SHIPPING',
      message: 'اطلاعات کامل آدرس و گیرنده الزامی است.'
    });
  }

  const isWholesaleUser = req.user.role === 'ADMIN' || (req.user.role === 'WHOLESALE' && req.user.isWholesaleVerified === true);

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
        message: `محصول «${item.productTitle || item.productId}» در حال حاضر در دسترس نیست.`
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

  const shippingFee = subtotal > 2000000 || isWholesaleUser ? 0 : 45000;
  const payableAmount = subtotal + shippingFee;

  const order = db.createOrder({
    userId: req.user.id,
    userFullName: req.user.fullName,
    userEmail: req.user.email,
    orderType: hasWholesaleItem ? 'WHOLESALE' : 'RETAIL',
    items: orderItems,
    totalAmount: subtotal,
    discountAmount: 0,
    payableAmount,
    paymentMethod: paymentMethod || 'ONLINE_GATEWAY',
    shippingAddress
  });

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

// Get Order Details
router.get('/:id', requireAuth, (req, res) => {
  const order = db.findOrderById(req.params.id);

  if (!order) {
    return res.status(404).json({
      success: false,
      error: 'ORDER_NOT_FOUND',
      message: 'سفارش مورد نظر یافت نشد.'
    });
  }

  // Security: Check ownership or admin
  if (order.userId !== req.user.id && req.user.role !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'شما دسترسی به این سفارش را ندارید.'
    });
  }

  res.json({
    success: true,
    data: order
  });
});

export default router;
