// =============================================================================
//  Payment Routes (BL-006 / ADR-008)
//
//  Flow:
//    1. Customer checks out              -> POST /api/orders        (UNPAID order)
//    2. Client asks for a payment link   -> POST /api/payments/request
//    3. Customer pays on the PSP page
//    4. PSP redirects back               -> GET  /api/payments/callback
//    5. Server verifies with the PSP     -> order marked PAID (idempotent)
//    6. Client can poll                  -> GET  /api/payments/status/:orderId
//
//  Security invariants:
//    - The amount is always read from the stored order, never from the request.
//    - Verification is idempotent: a repeated callback cannot double-charge or
//      double-flip the order status.
//    - Only the order owner (or an admin) may request a link or read status.
// =============================================================================
import { Router } from 'express';
import { db } from '../db/store.js';
import { requireAuth } from '../middlewares/auth.js';
import { validate, paymentRequestSchema } from '../middlewares/validate.js';
import { getPaymentProvider } from '../services/payment/provider.js';

const router = Router();

function getCallbackUrl(req) {
  const base = (process.env.PAYMENT_CALLBACK_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return `${base}/api/payments/callback`;
}

/**
 * Step 2 — create a payment session for an existing order.
 */
router.post('/request', requireAuth, validate(paymentRequestSchema), async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const order = db.findOrderById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, error: 'ORDER_NOT_FOUND', message: 'سفارش مورد نظر یافت نشد.' });
    }

    // Ownership check (BOLA/IDOR) — same rule as order.routes.js
    if (order.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'شما دسترسی مجاز برای پرداخت این سفارش را ندارید.' });
    }

    if (order.paymentStatus === 'PAID') {
      return res.status(409).json({ success: false, error: 'ORDER_ALREADY_PAID', message: 'این سفارش قبلاً پرداخت شده است.' });
    }

    if (order.paymentMethod !== 'ONLINE_GATEWAY') {
      return res.status(400).json({
        success: false,
        error: 'PAYMENT_METHOD_NOT_ONLINE',
        message: 'روش پرداخت این سفارش آنلاین نیست و از طریق فیش بانکی بررسی می‌شود.'
      });
    }

    const { name: providerName, adapter } = getPaymentProvider();
    const amountToman = Math.round(Number(order.payableAmount) || 0);
    const amountRial = providerName === 'zarinpal'
      ? adapter.tomanToRial(amountToman)
      : amountToman * 10;

    const session = await adapter.request({
      amountRial,
      amountToman,
      description: `پرداخت سفارش ${order.orderNumber} — مانتو مدا`,
      callbackUrl: getCallbackUrl(req),
      orderId: order.id,
      mobile: req.user.phone,
      email: req.user.email
    });

    const payment = db.createPayment({
      orderId: order.id,
      userId: order.userId,
      provider: session.provider,
      authority: session.authority,
      amountRial,
      amountToman
    });

    res.status(201).json({
      success: true,
      data: {
        paymentId: payment.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        authority: session.authority,
        paymentUrl: session.paymentUrl,
        amountToman,
        provider: session.provider
      },
      message: 'لینک پرداخت ایجاد شد.'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Shared verification routine used by both the browser callback and the JSON verify endpoint.
 */
async function verifyPayment({ authority, status: gatewayStatus, req }) {
  const payment = db.findPaymentByAuthority(authority);

  if (!payment) {
    return { httpStatus: 404, body: { success: false, error: 'PAYMENT_NOT_FOUND', message: 'نشست پرداخت یافت نشد.' } };
  }

  const order = db.findOrderById(payment.orderId);
  if (!order) {
    return { httpStatus: 404, body: { success: false, error: 'ORDER_NOT_FOUND', message: 'سفارش مرتبط با این پرداخت یافت نشد.' } };
  }

  // Already verified — idempotent, never charge or re-verify twice.
  if (payment.status === 'PAID') {
    return {
      httpStatus: 200,
      body: {
        success: true,
        data: { orderId: order.id, orderNumber: order.orderNumber, paymentStatus: 'PAID', refId: payment.refId, alreadyVerified: true },
        message: 'این تراکنش قبلاً تأیید شده است.'
      }
    };
  }

  // The gateway reported failure/cancellation. We still ask the PSP for the
  // authoritative answer, but a "NOK" status is recorded as a failed attempt.
  if (gatewayStatus && String(gatewayStatus).toUpperCase() !== 'OK') {
    db.markPaymentAttemptFailed(authority);
    return {
      httpStatus: 200,
      body: {
        success: false,
        error: 'PAYMENT_CANCELLED',
        message: 'پرداخت توسط کاربر لغو شد یا ناموفق بود.',
        data: { orderId: order.id, orderNumber: order.orderNumber, paymentStatus: order.paymentStatus }
      }
    };
  }

  const { adapter } = getPaymentProvider();
  const result = await adapter.verify({ authority, amountRial: payment.amountRial });

  if (!result.ok) {
    db.markPaymentAttemptFailed(authority);
    return {
      httpStatus: 200,
      body: {
        success: false,
        error: 'PAYMENT_VERIFICATION_FAILED',
        message: result.errorMessage || 'تأیید تراکنش ناموفق بود.',
        data: { orderId: order.id, orderNumber: order.orderNumber, paymentStatus: order.paymentStatus, gatewayCode: result.errorCode ?? null }
      }
    };
  }

  db.markPaymentVerified(authority, { refId: result.refId, cardPan: result.cardPan, status: 'PAID' });
  db.markOrderPaid(order.id, { paymentStatus: 'PAID', refId: result.refId });

  return {
    httpStatus: 200,
    body: {
      success: true,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentStatus: 'PAID',
        refId: result.refId,
        cardPan: result.cardPan,
        alreadyVerified: Boolean(result.alreadyVerified)
      },
      message: 'پرداخت با موفقیت تأیید شد.'
    }
  };
}

/**
 * Step 4 — the PSP redirects the customer's browser here.
 * Responds with a redirect to the storefront result page so the SPA can render it.
 */
router.get('/callback', async (req, res, next) => {
  try {
    const authority = req.query.Authority || req.query.authority;
    const gatewayStatus = req.query.Status || req.query.status;

    if (!authority) {
      return res.status(400).json({ success: false, error: 'MISSING_AUTHORITY', message: 'پارامتر Authority الزامی است.' });
    }

    const { httpStatus, body } = await verifyPayment({ authority, status: gatewayStatus, req });

    // Browser redirect back into the SPA
    const ok = body?.success === true;
    const params = new URLSearchParams({
      payment: ok ? 'success' : 'failed',
      order: body?.data?.orderNumber || '',
      ref: body?.data?.refId || ''
    });

    if (req.query.format === 'json') {
      return res.status(httpStatus).json(body);
    }

    return res.redirect(302, `/?${params.toString()}`);
  } catch (error) {
    next(error);
  }
});

/**
 * JSON verification endpoint (used by the SPA and by tests; also handy for
 * PSPs configured with a POST callback).
 */
router.post('/verify', async (req, res, next) => {
  try {
    const authority = req.body?.authority || req.body?.Authority;
    const gatewayStatus = req.body?.status || req.body?.Status;

    if (!authority) {
      return res.status(400).json({ success: false, error: 'MISSING_AUTHORITY', message: 'پارامتر authority الزامی است.' });
    }

    const { httpStatus, body } = await verifyPayment({ authority, status: gatewayStatus, req });
    return res.status(httpStatus).json(body);
  } catch (error) {
    next(error);
  }
});

/**
 * Step 6 — payment status for an order (owner or admin only).
 */
router.get('/status/:orderId', requireAuth, (req, res) => {
  const order = db.findOrderById(req.params.orderId);

  if (!order) {
    return res.status(404).json({ success: false, error: 'ORDER_NOT_FOUND', message: 'سفارش مورد نظر یافت نشد.' });
  }

  if (order.userId !== req.user.id && req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'شما دسترسی مجاز به این سفارش را ندارید.' });
  }

  const payment = db.findPaymentByOrderId(order.id);

  res.json({
    success: true,
    data: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      payableAmount: order.payableAmount,
      refId: payment?.refId || order.paymentRefId || null,
      provider: payment?.provider || null,
      paymentRecordStatus: payment?.status || null
    }
  });
});

export default router;
