import { Router } from 'express';
import { db, ORDER_STATUSES } from '../db/store.js';
import { notifyStatusChange } from '../services/notification.service.js';
import { requireRole } from '../middlewares/auth.js';

const router = Router();

// Guard all admin routes with requireRole('ADMIN')
router.use(requireRole('ADMIN'));

// Admin Dashboard Overview Statistics
router.get('/stats', (req, res) => {
  const orders = db.listOrders();
  const applications = db.listApplications();
  const products = db.listProducts();
  const users = db.users;

  const totalRevenue = orders.reduce((acc, o) => acc + (o.payableAmount || 0), 0);
  const pendingWholesaleCount = applications.filter(a => a.status === 'PENDING').length;
  const verifiedWholesaleCount = users.filter(u => u.role === 'WHOLESALE' && u.isWholesaleVerified).length;
  const pendingOrdersCount = orders.filter(o => o.status === 'PENDING' || o.status === 'PROCESSING').length;

  res.json({
    success: true,
    data: {
      totalRevenue,
      ordersCount: orders.length,
      pendingOrdersCount,
      pendingWholesaleCount,
      verifiedWholesaleCount,
      productsCount: products.length,
      usersCount: users.length
    }
  });
});

// List Wholesale Applications with status filter
router.get('/wholesale/applications', (req, res) => {
  const { status } = req.query;
  let apps = db.listApplications();

  if (status) {
    apps = apps.filter(a => a.status === status);
  }

  res.json({
    success: true,
    data: apps
  });
});

// Review Wholesale Application (Approve or Reject)
router.post('/wholesale/applications/:id/review', (req, res) => {
  const { status, adminNotes } = req.body; // status: 'APPROVED' or 'REJECTED'

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_STATUS',
      message: 'وضعیت باید APPROVED یا REJECTED باشد.'
    });
  }

  const updatedApp = db.reviewApplication(req.params.id, {
    status,
    adminNotes,
    reviewerId: req.user.id
  });

  if (!updatedApp) {
    return res.status(404).json({
      success: false,
      error: 'APPLICATION_NOT_FOUND',
      message: 'درخواست عمده‌فروشی مورد نظر یافت نشد.'
    });
  }

  res.json({
    success: true,
    data: updatedApp,
    message: status === 'APPROVED' 
      ? `درخواست خریدار عمده (${updatedApp.companyName}) تایید شد و دسترسی قیمت عمده فعال گردید.`
      : `درخواست خریدار عمده (${updatedApp.companyName}) رد شد.`
  });
});

// Admin Product Management
router.get('/products', (req, res) => {
  const products = db.listProducts();
  res.json({
    success: true,
    data: products
  });
});

router.post('/products', (req, res) => {
  const productData = req.body;
  if (!productData.title || !productData.retailPrice) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_FIELDS',
      message: 'عنوان محصول و قیمت خرده‌فروشی الزامی هستند.'
    });
  }

  const created = db.createProduct(productData);
  res.status(201).json({
    success: true,
    data: created,
    message: 'محصول جدید با موفقیت ثبت شد.'
  });
});

router.put('/products/:id', (req, res) => {
  const updated = db.updateProduct(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({
      success: false,
      error: 'PRODUCT_NOT_FOUND',
      message: 'محصول یافت نشد.'
    });
  }

  res.json({
    success: true,
    data: updated,
    message: 'اطلاعات محصول با موفقیت به‌روزرسانی شد.'
  });
});

// Admin Orders Management
router.get('/orders', (req, res) => {
  const orders = db.listOrders();
  res.json({
    success: true,
    data: orders
  });
});

router.put('/orders/:id/status', (req, res) => {
  const { status, note } = req.body || {};

  const result = db.transitionOrderStatus(req.params.id, status, {
    by: req.user?.id || 'admin',
    note: note || ''
  });

  if (!result.ok) {
    if (result.reason === 'ORDER_NOT_FOUND') {
      return res.status(404).json({ success: false, error: 'ORDER_NOT_FOUND', message: 'سفارش یافت نشد.' });
    }

    if (result.reason === 'INVALID_STATUS') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_ORDER_STATUS',
        message: `وضعیت سفارش نامعتبر است. وضعیت‌های مجاز: ${ORDER_STATUSES.join(', ')}`,
        allowedStatuses: ORDER_STATUSES
      });
    }

    // Invalid transition (ADR-011): the order lifecycle is a state machine, not
    // a free-form field. A delivered order cannot go back to pending, etc.
    return res.status(409).json({
      success: false,
      error: 'INVALID_STATUS_TRANSITION',
      message: `گذار از وضعیت «${result.from}» به «${status}» مجاز نیست.`,
      from: result.from,
      allowedTransitions: result.allowed
    });
  }

  // Cancelling returns the reserved stock to the catalog.
  if (status === 'CANCELLED' && result.order.stockReserved) {
    const released = db.releaseStock(result.order.items);
    result.order.stockReleased = released;
    result.order.stockReserved = false;
    db.persist();
  }

  // Customer SMS (ADR-012) — fire and forget, never blocks the admin request.
  notifyStatusChange(result.order, status);

  res.json({
    success: true,
    data: result.order,
    message: `وضعیت سفارش از «${result.from}» به «${status}» تغییر یافت.`,
    allowedTransitions: result.allowed
  });
});

export default router;
