import { calculateOrderTotals, describeShipping } from '../services/pricing/shipping.service.js';
import { previewCoupon } from '../services/pricing/coupon.service.js';
import { Router } from 'express';
import { db } from '../db/store.js';

const router = Router();

// Calculate cart totals with strict backend price validation & wholesale rules
router.post('/calculate', (req, res) => {
  const { items, couponCode, shippingAddress } = req.body; // array of { productId, variantId, quantity }

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
        wholesaleNotices: [],
        stockNotices: [],
        hasStockProblem: false
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
  const stockNotices = [];

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

    // Availability (ADR-011): surface stock problems before checkout, so the
    // customer finds out here rather than at the payment step.
    const availableStock = variant ? Number(variant.stock) || 0 : 0;
    const hasStockProblem = availableStock < qty;
    if (hasStockProblem) {
      stockNotices.push({
        productId: product.id,
        variantId: variant ? variant.id : null,
        productTitle: product.title,
        color: variant ? variant.color : '',
        size: variant ? variant.size : '',
        requested: qty,
        available: availableStock,
        message: availableStock === 0
          ? `«${product.title}» (${variant ? variant.color : ''} - سایز ${variant ? variant.size : ''}) در حال حاضر موجود نیست.`
          : `از «${product.title}» فقط ${availableStock} عدد موجود است (تعداد درخواستی: ${qty}).`
      });
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
      availableStock,
      hasStockProblem,
      itemTotal,
      itemSavings
    });
  }

  // --- Coupon preview (ADR-018). Advisory only: checkout recomputes it. -----
  const couponResult = couponCode ? previewCoupon({ code: couponCode, subtotal, user: req.user }) : null;

  // --- Totals from the single pricing source (ADR-017) ---------------------
  const totals = calculateOrderTotals({
    subtotal,
    discount: couponResult?.ok ? couponResult.discount : 0,
    province: shippingAddress?.province || req.body.province || '',
    isWholesale: isWholesaleUser
  });

  res.json({
    success: true,
    data: {
      items: processedItems,
      itemsCount: totalQuantity,
      subtotal,
      totalSavings,
      discountAmount: totals.discountAmount,
      coupon: couponResult
        ? { code: couponCode, applied: couponResult.ok, discount: couponResult.discount || 0, message: couponResult.message }
        : null,
      shippingFee: totals.shippingFee,
      shipping: {
        isFree: totals.shipping.isFree,
        reason: totals.shipping.reason,
        description: describeShipping(totals.shipping)
      },
      payableAmount: totals.payableAmount,
      freeShippingThreshold: totals.shipping.threshold,
      isWholesaleOrder: isWholesaleUser && processedItems.some(i => i.isWholesalePriceApplied),
      wholesaleNotices,
      stockNotices,
      hasStockProblem: stockNotices.length > 0
    }
  });
});

export default router;
