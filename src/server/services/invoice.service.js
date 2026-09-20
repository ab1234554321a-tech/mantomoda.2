// =============================================================================
//  Invoice links + printable invoice (Phase 10 item 7)
//
//  Design choice: the invoice link is signed (HMAC) and time-limited rather than
//  login-protected. Rationale:
//    - a customer must be able to forward the invoice to their accountant, who
//      has no account on the shop;
//    - a plain public URL is unacceptable: it contains a home address and phone.
//  So: `?k=<base64url(orderNumber:expiry)>` where the signature is derived from
//  the server secret. Guessing a link is impractical, and links expire.
// =============================================================================
import crypto from 'crypto';
import { db } from '../db/store.js';

const DEFAULT_TTL_DAYS = Number(process.env.INVOICE_LINK_TTL_DAYS || 30);

function secret() {
  return process.env.JWT_SECRET || 'insecure-development-secret';
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** @returns {string} token of the form `<expEpochSeconds>.<signature>` */
export function createInvoiceToken(orderNumber, { ttlDays = DEFAULT_TTL_DAYS } = {}) {
  const exp = Math.floor(Date.now() / 1000) + ttlDays * 86400;
  const payload = `${orderNumber}:${exp}`;
  return `${exp}.${sign(payload)}`;
}

export function verifyInvoiceToken(orderNumber, token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return { ok: false, reason: 'MALFORMED' };

  const [expPart, signature] = token.split('.');
  const exp = Number(expPart);
  if (!Number.isFinite(exp)) return { ok: false, reason: 'MALFORMED' };
  if (exp * 1000 < Date.now()) return { ok: false, reason: 'EXPIRED' };

  const expected = sign(`${orderNumber}:${exp}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }

  return { ok: true };
}

export function invoiceUrlFor(order, { ttlDays = DEFAULT_TTL_DAYS } = {}) {
  const token = createInvoiceToken(order.orderNumber, { ttlDays });
  return `/order/${encodeURIComponent(order.orderNumber)}/invoice?k=${token}`;
}

/**
 * The data a printable invoice renders. Amounts are read from the stored order
 * only — an invoice must never be able to disagree with what was charged.
 */
export function buildInvoice(order) {
  const settings = db.getSettings();
  const lines = (order.items || []).map(item => ({
    title: item.productTitle,
    variant: [item.color, item.size].filter(Boolean).join(' / '),
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.unitPrice) || 0,
    totalPrice: Number(item.totalPrice) || (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0)
  }));

  const subtotal = lines.reduce((sum, line) => sum + line.totalPrice, 0);
  const discount = Number(order.discountAmount) || 0;
  const shipping = Number(order.shippingFee) || 0;

  return {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    status: order.status,
    paymentStatus: order.paymentStatus || 'PENDING',
    paymentMethod: order.paymentMethod,
    paymentRefId: order.paymentRefId || null,
    trackingCode: order.trackingCode || null,
    couponCode: order.couponCode || null,
    orderType: order.orderType,
    customer: {
      name: order.shippingAddress?.recipientName || order.userFullName,
      phone: order.shippingAddress?.phone || order.userPhone || '',
      email: order.userEmail || '',
      province: order.shippingAddress?.province || '',
      city: order.shippingAddress?.city || '',
      address: order.shippingAddress?.fullAddress || '',
      postalCode: order.shippingAddress?.postalCode || ''
    },
    lines,
    totals: {
      subtotal,
      discount,
      shipping,
      payable: Number(order.payableAmount) || subtotal - discount + shipping
    },
    shop: {
      name: settings.shop.name,
      address: settings.shop.address,
      phone: settings.shop.supportPhone,
      taxId: settings.shop.taxId,
      note: settings.shop.invoiceFooterNote
    },
    statusHistory: order.statusHistory || []
  };
}

export function findOrderByNumber(orderNumber) {
  return db.listOrders().find(o => o.orderNumber === orderNumber) || null;
}
