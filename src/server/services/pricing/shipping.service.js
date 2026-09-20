// =============================================================================
//  Shipping Policy — single source of truth (ADR-017)
//
//  Before this module the rule was copy-pasted in two route files:
//      `subtotal > 2000000 || isWholesaleUser ? 0 : 45000`
//  Two copies of a pricing rule drift apart, and the shop then quotes one number
//  in the cart and charges another at checkout. There is now exactly one
//  implementation, driven by admin-editable settings.
// =============================================================================
import { db } from '../../db/store.js';

export const FREE_SHIPPING_REASON = {
  WHOLESALE: 'ارسال برای همکاران عمده‌فروشی رایگان است.',
  THRESHOLD: 'مبلغ سفارش شما از آستانه ارسال رایگان گذشته است.',
  PROVINCE: 'تعرفه اختصاصی این استان اعمال شد.',
  FLAT: 'تعرفه ارسال بر اساس استان مقصد محاسبه شد.'
};

/**
 * @param {object} params
 * @param {number} params.subtotal        Goods total AFTER discounts.
 * @param {string} [params.province]      Destination province (free text from the form).
 * @param {boolean} [params.isWholesale]  Verified wholesale customer?
 * @param {object} [params.settings]      Injected for tests; defaults to the live settings.
 * @returns {{ fee:number, isFree:boolean, reason:string, baseFee:number, threshold:number, source:string }}
 */
export function calculateShipping({ subtotal = 0, province = '', isWholesale = false, settings } = {}) {
  const config = (settings || db.getSettings()).shipping;
  const goods = Math.max(0, Number(subtotal) || 0);
  const normalizedProvince = String(province || '').trim();

  const baseFee = Number(config.provinceFees?.[normalizedProvince] ?? config.flatFee) || 0;
  const usesProvinceFee = normalizedProvince && config.provinceFees?.[normalizedProvince] !== undefined;

  if (isWholesale && config.wholesaleAlwaysFree) {
    return { fee: 0, isFree: true, baseFee, threshold: config.freeShippingThreshold, source: 'WHOLESALE', reason: FREE_SHIPPING_REASON.WHOLESALE };
  }

  if (goods >= Number(config.freeShippingThreshold || 0)) {
    return { fee: 0, isFree: true, baseFee, threshold: config.freeShippingThreshold, source: 'THRESHOLD', reason: FREE_SHIPPING_REASON.THRESHOLD };
  }

  return {
    fee: baseFee,
    isFree: baseFee === 0,
    baseFee,
    threshold: config.freeShippingThreshold,
    source: usesProvinceFee ? 'PROVINCE' : 'FLAT',
    reason: usesProvinceFee ? FREE_SHIPPING_REASON.PROVINCE : FREE_SHIPPING_REASON.FLAT
  };
}

/**
 * Order totals in one place: goods − discount + shipping = payable.
 * The client may display these numbers, but it is never trusted to send them.
 */
export function calculateOrderTotals({ subtotal = 0, discount = 0, province = '', isWholesale = false }) {
  const goods = Math.max(0, Number(subtotal) || 0);
  const safeDiscount = Math.min(Math.max(0, Number(discount) || 0), goods);
  const netGoods = goods - safeDiscount;
  const shipping = calculateShipping({ subtotal: netGoods, province, isWholesale });

  return {
    subtotal: goods,
    discountAmount: safeDiscount,
    netGoods,
    shippingFee: shipping.fee,
    shipping,
    payableAmount: netGoods + shipping.fee
  };
}

/** Human-readable summary used in the cart/checkout UI. */
export function describeShipping(shipping) {
  if (shipping.isFree) return `ارسال رایگان — ${shipping.reason}`;
  return `هزینه ارسال: ${shipping.fee.toLocaleString('fa-IR')} تومان (${shipping.reason})`;
}
