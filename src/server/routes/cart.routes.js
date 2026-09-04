import { Router } from 'express';
import { db } from '../db/store.js';

const router = Router();

// Calculate cart totals with strict backend price validation & wholesale rules
router.post('/calculate', (req, res) => {
  const { items } = req.body; // array of { productId, variantId, quantity }

  if (!Array.isArray(items) || items.length === 0) {
    return res.json({
      success: true,
      data: {
        items: [],
        itemsCount: 0,
        subtotal: 0,
        discountAmount: 0,
        shippingFee: 0,
        payableAmount: 0,
        isWholesaleOrder: false,
        wholesaleNotices: []
      }
    });
  }

  const isWholesaleUser = req.user && (
    req.user.role === 'ADMIN' || 
    (req.user.role === 'WHOLESALE' && req.user.isWholesaleVerified === true)
  );

  let subtotal = 0;
  let totalSavings = 0;
  let totalQuantity = 0;
  const processedItems = [];
  const wholesaleNotices = [];

  for (const item of items) {
    const product = db.findProductById(item.productId);
    if (!product || !product.isActive) {
      continue;
    }

    const variant = (product.variants || []).find(v => v.id === item.variantId) || product.variants[0];
    const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
    totalQuantity += qty;

    let appliedPrice = product.retailPrice;
    let isWholesalePriceApplied = false;
    let unitSavings = 0;

    if (isWholesaleUser) {
      const minQty = product.wholesaleMinQuantity || 6;
      if (qty >= minQty) {
        appliedPrice = product.wholesalePrice;
        isWholesalePriceApplied = true;
        unitSavings = product.retailPrice - product.wholesalePrice;
      } else {
        wholesaleNotices.push({
          productId: product.id,
          productTitle: product.title,
          currentQuantity: qty,
          requiredMinQuantity: minQty,
          message: `برای اعمال قیمت عمده برای «${product.title}»، حداقل سفارش ${minQty} عدد است (تعداد فعلی: ${qty}).`
        });
      }
    }

    const itemTotal = appliedPrice * qty;
    const itemSavings = unitSavings * qty;

    subtotal += itemTotal;
    totalSavings += itemSavings;

    processedItems.push({
      productId: product.id,
      productTitle: product.title,
      productImage: product.images[0],
      variantId: variant ? variant.id : null,
      color: variant ? variant.color : '',
      size: variant ? variant.size : '',
      quantity: qty,
      unitPrice: appliedPrice,
      retailPrice: product.retailPrice,
      wholesalePrice: isWholesaleUser ? product.wholesalePrice : undefined,
      isWholesalePriceApplied,
      itemTotal,
      itemSavings
    });
  }

  const shippingFee = subtotal > 2000000 || isWholesaleUser ? 0 : 45000;
  const payableAmount = subtotal + shippingFee;

  res.json({
    success: true,
    data: {
      items: processedItems,
      itemsCount: totalQuantity,
      subtotal,
      totalSavings,
      shippingFee,
      payableAmount,
      isWholesaleOrder: isWholesaleUser && processedItems.some(i => i.isWholesalePriceApplied),
      wholesaleNotices
    }
  });
});

export default router;
