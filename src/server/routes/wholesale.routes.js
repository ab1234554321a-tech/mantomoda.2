import { Router } from 'express';
import { db } from '../db/store.js';
import { requireAuth } from '../middlewares/auth.js';
import { validate, wholesaleApplySchema } from '../middlewares/validate.js';

const router = Router();

// Submit a Wholesale Application with Schema Validation
router.post('/apply', requireAuth, validate(wholesaleApplySchema), (req, res) => {
  const { companyName, economicCode, businessAddress, city, province, businessPhone, storeType } = req.body;

  // Check if user already has an active application
  const existing = db.findApplicationByUserId(req.user.id);
  if (existing && existing.status === 'PENDING') {
    return res.status(409).json({
      success: false,
      error: 'APPLICATION_ALREADY_PENDING',
      message: 'درخواست شما قبلاً ثبت شده و در دست بررسی کارشناسان مدا می‌باشد.'
    });
  }

  const app = db.createApplication({
    userId: req.user.id,
    userFullName: req.user.fullName,
    userEmail: req.user.email,
    userPhone: req.user.phone,
    companyName,
    economicCode,
    businessAddress,
    city,
    province: province || city,
    businessPhone,
    storeType: storeType || 'PHYSICAL_STORE'
  });

  res.status(201).json({
    success: true,
    data: app,
    message: 'درخواست حساب عمده‌فروشی شما با موفقیت ثبت شد. پس از بررسی مدارک توسط کارشناسان، حساب شما فعال خواهد شد.'
  });
});

// Check current user's application status
router.get('/my-application', requireAuth, (req, res) => {
  const app = db.findApplicationByUserId(req.user.id);

  res.json({
    success: true,
    data: {
      hasApplication: Boolean(app),
      application: app || null,
      isWholesaleVerified: req.user.isWholesaleVerified,
      currentRole: req.user.role
    }
  });
});

export default router;
