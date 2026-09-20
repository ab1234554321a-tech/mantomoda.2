// =============================================================================
//  Low-stock alerts (ADR-019)
//
//  When a sale pushes a variant to (or below) the configured threshold, the
//  shop owner gets an SMS. This is the cheapest possible fix for the most
//  expensive daily mistake: selling an item that is no longer in stock because
//  nobody noticed the count hit zero.
//
//  Rules:
//    - one alert per variant per throttle window (settings.inventory.alertThrottleHours),
//      so a busy day does not turn into an SMS storm;
//    - a missing owner mobile is not an error, it simply disables alerts;
//    - never throws: an alert must not be able to fail a checkout.
// =============================================================================
import { db } from '../db/store.js';
import { getSmsProvider } from './sms/provider.js';

function buildAlertMessage(items) {
  if (items.length === 1) {
    const item = items[0];
    const size = item.size ? ` — سایز ${item.size}` : '';
    const color = item.color ? ` / ${item.color}` : '';
    if (item.stock === 0) {
      return `مانتو مدا (هشدار موجودی): «${item.productTitle}»${color}${size} تمام شد. برای جلوگیری از سفارش ناموجود، موجودی را به‌روز کنید.`;
    }
    return `مانتو مدا (هشدار موجودی): «${item.productTitle}»${color}${size} فقط ${item.stock} عدد مانده است.`;
  }

  const lines = items
    .slice(0, 3)
    .map(i => `${i.productTitle}${i.size ? ` (${i.size})` : ''}: ${i.stock}`)
    .join(' | ');
  const extra = items.length > 3 ? ` و ${items.length - 3} قلم دیگر` : '';
  return `مانتو مدا (هشدار موجودی): ${items.length} تنوع کالا به حد بحرانی رسید — ${lines}${extra}`;
}

/**
 * @param {object} [options]
 * @param {Array}  [options.items]  Restrict the check to these order lines
 *                                  (used right after a sale).
 * @returns {Promise<{alerted:number, skipped:boolean, reason?:string}>}
 */
export async function checkLowStock({ items } = {}) {
  const settings = db.getSettings();
  const ownerMobile = String(settings.shop?.ownerMobile || '').trim();

  if (!ownerMobile) {
    return { alerted: 0, skipped: true, reason: 'NO_OWNER_MOBILE' };
  }

  const due = db.takeAlertableLowStock(
    settings.inventory.lowStockThreshold,
    settings.inventory.alertThrottleHours
  );

  // When called after a sale we only care about the variants just sold; the
  // throttle timestamp is still consumed so we do not re-alert later.
  const relevant = items
    ? due.filter(d => items.some(i => i.variantId === d.variantId || (!i.variantId && i.productId === d.productId)))
    : due;

  if (relevant.length === 0) {
    return { alerted: 0, skipped: true, reason: 'NOTHING_DUE' };
  }

  const message = buildAlertMessage(relevant);
  const { name: providerName, adapter } = getSmsProvider();

  try {
    const result = await adapter.sendMessage({ mobile: ownerMobile, message });
    console.log(`[InventoryAlert] Sent to owner via ${providerName}: ${relevant.length} variant(s) low.`);
    return { alerted: relevant.length, provider: providerName, messageId: result.messageId || null };
  } catch (error) {
    console.error(`[InventoryAlert] Owner alert failed via ${providerName}: ${error.message}`);
    return { alerted: 0, skipped: true, reason: 'SEND_FAILED', error: error.message };
  }
}

/** Fire-and-forget wrapper for the checkout path. */
export async function checkLowStockAfterSale(orderItems = []) {
  try {
    const items = orderItems.map(i => ({ productId: i.productId, variantId: i.variantId }));
    return await checkLowStock({ items });
  } catch (error) {
    console.error('[InventoryAlert] check failed:', error.message);
    return { alerted: 0, skipped: true, reason: 'ERROR' };
  }
}
