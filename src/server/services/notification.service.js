// =============================================================================
//  Order Notification Service (ADR-012)
//
//  Sends the customer a Persian SMS whenever their order lifecycle changes.
//  This is the single biggest support-cost reducer for a fashion retailer: the
//  "where is my order?" call disappears.
//
//  Design rules:
//    1. A notification NEVER blocks or fails the operation that triggered it.
//       Sending happens fire-and-forget; failures are logged and recorded on the
//       order (`notifications[]`) so they can be retried or investigated.
//    2. Every attempt is recorded with its outcome, so there is an audit trail.
//    3. No notification is sent without a mobile number on the order/user.
// =============================================================================
import { db } from '../db/store.js';
import { getSmsProvider } from './sms/provider.js';

const STATUS_MESSAGES = {
  CONFIRMED: (order) =>
    `مانتو مدا: سفارش ${order.orderNumber} تأیید شد و به‌زودی آماده‌سازی می‌شود. مبلغ: ${formatToman(order.payableAmount)} تومان`,
  PROCESSING: (order) =>
    `مانتو مدا: سفارش ${order.orderNumber} در حال آماده‌سازی و بسته‌بندی است.`,
  SHIPPED: (order) =>
    `مانتو مدا: سفارش ${order.orderNumber} ارسال شد. کد رهگیری متعاقباً پیامک می‌شود.`,
  DELIVERED: (order) =>
    `مانتو مدا: سفارش ${order.orderNumber} تحویل داده شد. از خرید شما سپاسگزاریم.`,
  CANCELLED: (order) =>
    `مانتو مدا: سفارش ${order.orderNumber} لغو شد. در صورت پرداخت، مبلغ تا ۷۲ ساعت آینده بازگشت داده می‌شود.`,
  PAID: (order) =>
    `مانتو مدا: پرداخت سفارش ${order.orderNumber} با موفقیت تأیید شد.`
};

export const NOTIFIABLE_STATUSES = Object.keys(STATUS_MESSAGES);

function formatToman(value) {
  return Number(value || 0).toLocaleString('fa-IR');
}

export function buildStatusMessage(order, status) {
  const builder = STATUS_MESSAGES[status];
  if (!builder) return null;
  return builder(order);
}

function orderMobile(order) {
  return order.shippingAddress?.phone || order.userPhone || '';
}

/**
 * Core sender. Never throws — return value describes what happened so callers
 * (and tests) can assert without try/catch everywhere.
 */
export async function sendOrderNotification(order, { status, kind = 'STATUS_CHANGE' } = {}) {
  if (!order) return { attempted: false, ok: false, reason: 'NO_ORDER' };

  const mobile = orderMobile(order);
  if (!mobile) {
    db.recordOrderNotification(order.id, {
      kind, status, at: new Date().toISOString(), ok: false, reason: 'NO_MOBILE'
    });
    return { attempted: false, ok: false, reason: 'NO_MOBILE' };
  }

  const message = buildStatusMessage(order, status);
  if (!message) return { attempted: false, ok: false, reason: 'NO_TEMPLATE' };

  const { name: providerName, adapter } = getSmsProvider();

  try {
    const result = await adapter.sendMessage({ mobile, message });
    db.recordOrderNotification(order.id, {
      kind,
      status,
      at: new Date().toISOString(),
      ok: true,
      provider: providerName,
      messageId: result.messageId || null,
      mobile
    });
    return { attempted: true, ok: true, provider: providerName, messageId: result.messageId || null };
  } catch (error) {
    console.error(`[Notification] Order ${order.orderNumber} (${status}) failed via ${providerName}: ${error.message}`);
    db.recordOrderNotification(order.id, {
      kind,
      status,
      at: new Date().toISOString(),
      ok: false,
      provider: providerName,
      mobile,
      error: error.message
    });
    return { attempted: true, ok: false, reason: 'SEND_FAILED', error: error.message };
  }
}

/** Fire-and-forget wrapper for "order placed". */
export function notifyOrderPlaced(order) {
  const message = `مانتو مدا: سفارش ${order.orderNumber} با مبلغ ${formatToman(order.payableAmount)} تومان ثبت شد.`;
  const mobile = orderMobile(order);
  if (!mobile) return;

  const { adapter } = getSmsProvider();
  adapter.sendMessage({ mobile, message })
    .then((result) => {
      db.recordOrderNotification(order.id, {
        kind: 'ORDER_PLACED', at: new Date().toISOString(), ok: true,
        messageId: result.messageId || null, mobile
      });
    })
    .catch((error) => {
      console.error(`[Notification] Order ${order.orderNumber} placement SMS failed: ${error.message}`);
      db.recordOrderNotification(order.id, {
        kind: 'ORDER_PLACED', at: new Date().toISOString(), ok: false, mobile, error: error.message
      });
    });
}

/** Fire-and-forget wrapper for payment success. */
export function notifyPaymentVerified(order) {
  sendOrderNotification(order, { status: 'PAID', kind: 'PAYMENT' }).catch(() => { /* already logged */ });
}

/**
 * Fire-and-forget wrapper for an order status transition.
 * The admin request must never fail because an SMS gateway is down.
 */
export function notifyStatusChange(order, status) {
  sendOrderNotification(order, { status, kind: 'STATUS_CHANGE' }).catch(() => { /* already logged */ });
}
