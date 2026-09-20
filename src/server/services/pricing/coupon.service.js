// =============================================================================
//  Coupon Engine (ADR-018)
//
//  Every rule is evaluated server-side at checkout, and the discount is
//  recomputed from the stored basket — the client never sends a discount number.
//  Rejection reasons are explicit so the storefront can show a useful Persian
//  message instead of a generic failure.
// =============================================================================
import { db } from '../../db/store.js';

export const COUPON_ERRORS = {
  NOT_FOUND: 'این کد تخفیف وجود ندارد. املای آن را بررسی کنید.',
  INACTIVE: 'این کد تخفیف غیرفعال شده است.',
  EXPIRED: 'این کد تخفیف منقضی شده است.',
  NOT_STARTED: 'این کد تخفیف هنوز فعال نشده است.',
  MIN_BASKET: (min) => `این کد برای سفارش‌های بالای ${Number(min).toLocaleString('fa-IR')} تومان است.`,
  WRONG_CHANNEL: 'این کد برای نوع حساب شما (خرده یا عمده) معتبر نیست.',
  USAGE_LIMIT: 'ظرفیت استفاده از این کد تخفیف پر شده است.',
  PER_USER_LIMIT: 'شما قبلاً از این کد تخفیف استفاده کرده‌اید.',
  DISABLED: 'کد تخفیف در حال حاضر توسط فروشگاه غیرفعال است.',
  EMPTY_BASKET: 'سبد خرید شما خالی است.',
  ZERO_DISCOUNT: 'این کد روی سبد فعلی تخفیفی ایجاد نمی‌کند.'
};

function roundToman(value) {
  return Math.round(Number(value) || 0);
}

/**
 * Compute the discount a coupon would apply to a basket.
 * @returns {{ok:boolean, code?:string, discount?:number, message?:string, reason?:string, coupon?:object}}
 */
export function evaluateCoupon({ code, subtotal = 0, user = null, orderType = 'RETAIL', channel = null }) {
  const settings = db.getSettings();

  if (!settings.coupons?.enabled) {
    return { ok: false, reason: 'DISABLED', message: COUPON_ERRORS.DISABLED };
  }

  const goods = Math.max(0, Number(subtotal) || 0);
  if (goods <= 0) {
    return { ok: false, reason: 'EMPTY_BASKET', message: COUPON_ERRORS.EMPTY_BASKET };
  }

  const coupon = db.findCouponByCode(code);
  if (!coupon || coupon.isArchived) {
    return { ok: false, reason: 'NOT_FOUND', message: COUPON_ERRORS.NOT_FOUND };
  }

  if (!coupon.isActive) {
    return { ok: false, reason: 'INACTIVE', message: COUPON_ERRORS.INACTIVE, code: coupon.code };
  }

  const now = Date.now();
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now) {
    return { ok: false, reason: 'EXPIRED', message: COUPON_ERRORS.EXPIRED, code: coupon.code };
  }

  if (goods < Number(coupon.minBasket || 0)) {
    return { ok: false, reason: 'MIN_BASKET', message: COUPON_ERRORS.MIN_BASKET(coupon.minBasket), code: coupon.code };
  }

  const effectiveChannel = channel || (orderType === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL');
  if (coupon.appliesTo && coupon.appliesTo !== 'ALL' && coupon.appliesTo !== effectiveChannel) {
    return { ok: false, reason: 'WRONG_CHANNEL', message: COUPON_ERRORS.WRONG_CHANNEL, code: coupon.code };
  }

  if (coupon.usageLimit && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit)) {
    return { ok: false, reason: 'USAGE_LIMIT', message: COUPON_ERRORS.USAGE_LIMIT, code: coupon.code };
  }

  if (coupon.perUserLimit && user?.id) {
    const used = db.countUserCouponUsage(user.id, coupon.code);
    if (used >= Number(coupon.perUserLimit)) {
      return { ok: false, reason: 'PER_USER_LIMIT', message: COUPON_ERRORS.PER_USER_LIMIT, code: coupon.code };
    }
  }

  let discount = coupon.type === 'PERCENT'
    ? roundToman((goods * Number(coupon.value)) / 100)
    : roundToman(coupon.value);

  if (coupon.maxDiscount) {
    discount = Math.min(discount, Number(coupon.maxDiscount));
  }

  // Safety rails: a coupon can never discount more than the basket, and never
  // more than the configured share of it (protects against a typo such as 1000%
  // or a fixed value larger than the cart).
  const shareCap = Math.floor(goods * Number(settings.coupons?.maxDiscountShare || 1));
  discount = Math.min(discount, goods, shareCap);

  if (discount <= 0) {
    return { ok: false, reason: 'ZERO_DISCOUNT', message: COUPON_ERRORS.ZERO_DISCOUNT, code: coupon.code };
  }

  return {
    ok: true,
    code: coupon.code,
    discount,
    coupon,
    message: coupon.type === 'PERCENT'
      ? `${coupon.value}٪ تخفیف اعمال شد (${discount.toLocaleString('fa-IR')} تومان).`
      : `${discount.toLocaleString('fa-IR')} تومان تخفیف اعمال شد.`
  };
}

/** Convenience wrapper used by the cart endpoint (never throws). */
export function previewCoupon(params) {
  try {
    return evaluateCoupon(params);
  } catch (error) {
    console.error('[Coupon] evaluation failed:', error.message);
    return { ok: false, reason: 'ERROR', message: 'محاسبه کد تخفیف با خطا مواجه شد.' };
  }
}
