// =============================================================================
//  Invoice routes (Phase 10 item 7)
//    GET /api/orders/:id/invoice   → JSON invoice (owner of the order or admin)
//    GET /api/orders/:id/invoice-link → signed, shareable printable URL
//    GET /order/:number/invoice?k=… → server-rendered printable page (no login)
// =============================================================================
import { Router } from 'express';
import { db } from '../db/store.js';
import { requireAuth } from '../middlewares/auth.js';
import { buildInvoice, verifyInvoiceToken, invoiceUrlFor } from '../services/invoice.service.js';

const router = Router();

function findOrder(id) {
  return db.findOrderById(id) || db.listOrders().find(o => o.orderNumber === id) || null;
}

/** Customers see their own invoice; admins see any. */
function canAccess(order, user) {
  if (!order || !user) return false;
  if (user.role === 'ADMIN') return true;
  return order.userId === user.id;
}

router.get('/orders/:id/invoice', requireAuth, (req, res) => {
  const order = findOrder(req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, error: 'ORDER_NOT_FOUND', message: 'سفارش یافت نشد.' });
  }

  if (!canAccess(order, req.user)) {
    // Same response shape as "not found" so an order id cannot be probed (BOLA).
    return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'دسترسی به این سفارش مجاز نیست.' });
  }

  res.json({ success: true, data: buildInvoice(order) });
});

router.get('/orders/:id/invoice-link', requireAuth, (req, res) => {
  const order = findOrder(req.params.id);

  if (!order) {
    return res.status(404).json({ success: false, error: 'ORDER_NOT_FOUND', message: 'سفارش یافت نشد.' });
  }

  if (!canAccess(order, req.user)) {
    return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'دسترسی به این سفارش مجاز نیست.' });
  }

  res.json({
    success: true,
    data: { url: invoiceUrlFor(order), expiresInDays: Number(process.env.INVOICE_LINK_TTL_DAYS || 30) },
    message: 'لینک فاکتور ساخته شد. این لینک تا ۳۰ روز معتبر است.'
  });
});

export default router;

// ---------------------------------------------------------------------------
// Public (signed-link) printable invoice — mounted at the app root.
// ---------------------------------------------------------------------------
export const publicInvoiceRouter = Router();

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toman(value) {
  return Number(value || 0).toLocaleString('fa-IR');
}

function invoiceHtml(invoice) {
  const rows = invoice.lines.map((line, index) => `
      <tr>
        <td>${toman(index + 1)}</td>
        <td>${escapeHtml(line.title)}${line.variant ? `<span class="variant">${escapeHtml(line.variant)}</span>` : ''}</td>
        <td>${toman(line.quantity)}</td>
        <td>${toman(line.unitPrice)}</td>
        <td>${toman(line.totalPrice)}</td>
      </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>فاکتور ${escapeHtml(invoice.orderNumber)} — ${escapeHtml(invoice.shop.name)}</title>
<style>
  :root { --brand: #c13957; --ink: #1e293b; --muted: #64748b; }
  * { box-sizing: border-box; }
  body { font-family: Vazirmatn, Tahoma, sans-serif; color: var(--ink); margin: 0; padding: 24px; background: #f8fafc; }
  .sheet { max-width: 820px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 28px; box-shadow: 0 1px 3px rgba(15,23,42,.08); }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; gap: 16px; flex-wrap: wrap; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: var(--muted); font-size: 12px; line-height: 1.9; }
  .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #fdf2f4; color: var(--brand); font-size: 12px; font-weight: 700; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin: 20px 0; }
  .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; }
  .card h3 { margin: 0 0 6px; font-size: 12px; color: var(--muted); font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  th, td { padding: 10px 8px; text-align: right; border-bottom: 1px solid #eef2f7; }
  th { background: #f8fafc; font-size: 12px; color: var(--muted); }
  .variant { display: block; color: var(--muted); font-size: 11px; }
  .totals { margin-top: 16px; margin-right: auto; width: min(320px, 100%); font-size: 13px; }
  .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
  .totals .grand { border-top: 2px solid #f1f5f9; margin-top: 6px; padding-top: 10px; font-weight: 800; font-size: 15px; }
  footer { margin-top: 22px; border-top: 1px dashed #e2e8f0; padding-top: 14px; }
  .actions { max-width: 820px; margin: 16px auto 0; display: flex; gap: 10px; justify-content: flex-start; }
  button, a.btn { font-family: inherit; font-size: 13px; font-weight: 700; padding: 10px 18px; border-radius: 10px; border: 0; background: var(--brand); color: #fff; text-decoration: none; cursor: pointer; }
  a.btn.secondary { background: #fff; color: var(--ink); border: 1px solid #cbd5e1; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { box-shadow: none; border-radius: 0; padding: 0; max-width: none; }
    .actions { display: none; }
  }
</style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()">چاپ فاکتور</button>
    <a class="btn secondary" href="/">بازگشت به فروشگاه</a>
  </div>

  <div class="sheet">
    <header>
      <div>
        <h1>${escapeHtml(invoice.shop.name)}</h1>
        <div class="muted">
          ${escapeHtml(invoice.shop.address)}${invoice.shop.phone ? `<br>تلفن پشتیبانی: ${escapeHtml(invoice.shop.phone)}` : ''}
          ${invoice.shop.taxId ? `<br>شناسه/کد اقتصادی: ${escapeHtml(invoice.shop.taxId)}` : ''}
        </div>
      </div>
      <div style="text-align:left">
        <div class="badge">فاکتور فروش</div>
        <div class="muted">
          شماره سفارش: <strong>${escapeHtml(invoice.orderNumber)}</strong><br>
          تاریخ: ${escapeHtml(invoice.createdAt.slice(0, 10))}<br>
          وضعیت پرداخت: ${escapeHtml(invoice.paymentStatus === 'PAID' ? 'پرداخت شده' : 'پرداخت‌نشده')}
        </div>
      </div>
    </header>

    <div class="grid">
      <div class="card">
        <h3>خریدار</h3>
        <div class="muted">
          ${escapeHtml(invoice.customer.name)}<br>
          ${escapeHtml(invoice.customer.phone)}${invoice.customer.email ? `<br>${escapeHtml(invoice.customer.email)}` : ''}
        </div>
      </div>
      <div class="card">
        <h3>نشانی تحویل</h3>
        <div class="muted">
          ${escapeHtml(invoice.customer.province)} — ${escapeHtml(invoice.customer.city)}<br>
          ${escapeHtml(invoice.customer.address)}${invoice.customer.postalCode ? `<br>کد پستی: ${escapeHtml(invoice.customer.postalCode)}` : ''}
        </div>
      </div>
      <div class="card">
        <h3>اطلاعات پرداخت</h3>
        <div class="muted">
          نوع سفارش: ${invoice.orderType === 'WHOLESALE' ? 'عمده‌فروشی' : 'خرده‌فروشی'}<br>
          روش: ${invoice.paymentMethod === 'BANK_TRANSFER_RECEIPT' ? 'حواله / کارت به کارت' : 'درگاه پرداخت'}<br>
          ${invoice.paymentRefId ? `کد پیگیری: <strong>${escapeHtml(invoice.paymentRefId)}</strong>` : 'کد پیگیری: —'}
        </div>
      </div>
    </div>

    <table>
      <thead>
        <tr><th>#</th><th>کالا</th><th>تعداد</th><th>قیمت واحد (تومان)</th><th>جمع (تومان)</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div><span>جمع کالاها</span><span>${toman(invoice.totals.subtotal)}</span></div>
      ${invoice.totals.discount ? `<div><span>تخفیف${invoice.couponCode ? ` (${escapeHtml(invoice.couponCode)})` : ''}</span><span>−${toman(invoice.totals.discount)}</span></div>` : ''}
      <div><span>هزینه ارسال</span><span>${invoice.totals.shipping === 0 ? 'رایگان' : toman(invoice.totals.shipping)}</span></div>
      <div class="grand"><span>مبلغ قابل پرداخت</span><span>${toman(invoice.totals.payable)} تومان</span></div>
    </div>

    <footer class="muted">
      ${escapeHtml(invoice.shop.note)}
      <br>این فاکتور به صورت خودکار توسط سامانه ${escapeHtml(invoice.shop.name)} صادر شده است.
    </footer>
  </div>
</body>
</html>`;
}

publicInvoiceRouter.get('/order/:orderNumber/invoice', (req, res) => {
  const { orderNumber } = req.params;
  const verification = verifyInvoiceToken(orderNumber, req.query.k);

  if (!verification.ok) {
    const message = verification.reason === 'EXPIRED'
      ? 'این لینک فاکتور منقضی شده است. برای دریافت لینک تازه با فروشگاه تماس بگیرید.'
      : 'لینک فاکتور نامعتبر است.';

    return res.status(verification.reason === 'EXPIRED' ? 410 : 403).type('html').send(
      `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>فاکتور در دسترس نیست</title>
       <meta name="robots" content="noindex"></head>
       <body style="font-family:Tahoma,sans-serif;padding:40px;text-align:center">
       <h2>${message}</h2><a href="/">بازگشت به فروشگاه</a></body></html>`
    );
  }

  const order = db.listOrders().find(o => o.orderNumber === orderNumber);
  if (!order) {
    return res.status(404).type('html').send('<!DOCTYPE html><html lang="fa" dir="rtl"><body style="font-family:Tahoma;padding:40px;text-align:center"><h2>سفارشی با این شماره یافت نشد.</h2></body></html>');
  }

  res.type('html').send(invoiceHtml(buildInvoice(order)));
});
