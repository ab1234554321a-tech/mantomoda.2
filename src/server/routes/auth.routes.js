import { Router } from 'express';
import { db } from '../db/store.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// Login
router.post('/login', (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_FIELDS',
      message: 'لطفاً ایمیل یا شماره موبایل خود را وارد کنید.'
    });
  }

  // Find by email or phone
  let user = db.findUserByEmail(identifier) || db.findUserByPhone(identifier);

  // If user not found, create a demo user if mock password provided
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: 'کاربری با این مشخصات یافت نشد.'
    });
  }

  if (password && password !== user.password && user.password) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_PASSWORD',
      message: 'رمز عبور وارد شده نادرست است.'
    });
  }

  const token = `token_${user.id}`;

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        fullName: user.fullName,
        role: user.role,
        isWholesaleVerified: user.isWholesaleVerified,
        companyName: user.companyName || ''
      }
    },
    message: 'ورود با موفقیت انجام شد.'
  });
});

// Register
router.post('/register', (req, res) => {
  const { fullName, email, phone, password } = req.body;

  if (!fullName || !phone || !password) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_FIELDS',
      message: 'نام و نام خانوادگی، شماره موبایل و رمز عبور الزامی است.'
    });
  }

  if (phone && db.findUserByPhone(phone)) {
    return res.status(409).json({
      success: false,
      error: 'PHONE_EXISTS',
      message: 'این شماره موبایل قبلاً ثبت‌نام شده است.'
    });
  }

  if (email && db.findUserByEmail(email)) {
    return res.status(409).json({
      success: false,
      error: 'EMAIL_EXISTS',
      message: 'این ایمیل قبلاً در سیستم ثبت شده است.'
    });
  }

  const newUser = db.createUser({
    fullName,
    email: email || `${phone}@manto-moda.ir`,
    phone,
    password,
    role: 'REGULAR'
  });

  const token = `token_${newUser.id}`;

  res.status(201).json({
    success: true,
    data: {
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        phone: newUser.phone,
        fullName: newUser.fullName,
        role: newUser.role,
        isWholesaleVerified: newUser.isWholesaleVerified
      }
    },
    message: 'ثبت‌نام شما با موفقیت انجام شد.'
  });
});

// Current User Profile
router.get('/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    data: req.user
  });
});

// Switch Role Demo Endpoint (For fast multi-perspective testing)
router.post('/switch-role', (req, res) => {
  const { targetRole } = req.body; // 'GUEST', 'REGULAR', 'WHOLESALE', 'PENDING', 'ADMIN'

  let targetUser = null;

  if (targetRole === 'ADMIN') {
    targetUser = db.findUserByEmail('admin@manto.ir');
  } else if (targetRole === 'WHOLESALE') {
    targetUser = db.findUserByEmail('boutique.tehran@manto.ir');
  } else if (targetRole === 'PENDING') {
    targetUser = db.findUserByEmail('boutique.shiraz@gmail.com');
  } else if (targetRole === 'REGULAR') {
    targetUser = db.findUserByEmail('neda.alavi@gmail.com');
  } else if (targetRole === 'GUEST') {
    return res.json({
      success: true,
      data: {
        token: null,
        user: null
      },
      message: 'حالت کاربر به مهمان (Guest) تغییر یافت.'
    });
  }

  if (!targetUser) {
    return res.status(404).json({
      success: false,
      error: 'USER_NOT_FOUND',
      message: 'کاربر مورد نظر برای این نقش یافت نشد.'
    });
  }

  res.json({
    success: true,
    data: {
      token: `token_${targetUser.id}`,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        phone: targetUser.phone,
        fullName: targetUser.fullName,
        role: targetUser.role,
        isWholesaleVerified: targetUser.isWholesaleVerified,
        companyName: targetUser.companyName || ''
      }
    },
    message: `حالت کاربر به ${targetUser.fullName} (${targetUser.role}) تغییر یافت.`
  });
});

export default router;
