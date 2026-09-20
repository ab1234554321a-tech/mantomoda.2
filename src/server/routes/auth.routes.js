import { Router } from 'express';
import { db } from '../db/store.js';
import { requireAuth } from '../middlewares/auth.js';
import { hashPassword, comparePassword, signToken } from '../utils/auth-crypto.js';
import { validate, loginSchema, registerSchema, otpRequestSchema, otpVerifySchema } from '../middlewares/validate.js';
import { requestOtp, verifyOtp, OTP_CONFIG } from '../services/otp.service.js';
import { isProduction, demoModeEnabled } from '../utils/runtime-mode.js';

const router = Router();

// Login with Schema Validation & Secure Password Verification
router.post('/login', validate(loginSchema), async (req, res) => {
  const { identifier, password } = req.body;

  // Find user by email or phone
  const user = db.findUserByEmail(identifier) || db.findUserByPhone(identifier);

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: 'کاربری با این مشخصات یافت نشد یا اطلاعات ورود نادرست است.'
    });
  }

  // Demo accounts are refused on a live shop even if one survived in an old
  // snapshot: their shared password is published in this repository (ADR-024).
  // The refusal is deliberately identical to a wrong password, so it reveals
  // nothing about which accounts exist.
  if (user.isDemo && isProduction()) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: 'اطلاعات ورود یا رمز عبور وارد شده نادرست است.'
    });
  }

  // Secure Password Verification (bcrypt)
  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: 'اطلاعات ورود یا رمز عبور وارد شده نادرست است.'
    });
  }

  // Generate Cryptographic JWT Token
  const token = signToken(user);

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

// Register with Schema Validation & Password Hashing
router.post('/register', validate(registerSchema), async (req, res) => {
  const { fullName, email, phone, password } = req.body;

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

  // Hash Password with bcrypt salt
  const passwordHash = await hashPassword(password);

  const newUser = db.createUser({
    fullName,
    email: email || `${phone}@manto-moda.ir`,
    phone,
    passwordHash,
    role: 'REGULAR',
    isWholesaleVerified: false
  });

  // Generate signed JWT token
  const token = signToken(newUser);

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


// ---------------------------------------------------------------------------
// OTP: request a verification code (BL-007 / TD-003)
// ---------------------------------------------------------------------------
router.post('/otp/request', validate(otpRequestSchema), async (req, res, next) => {
  try {
    const { mobile, fullName } = req.body;
    const result = await requestOtp({ mobile, fullName });

    res.json({
      success: true,
      data: {
        mobile,
        expiresInSeconds: result.expiresInSeconds,
        resendCooldownSeconds: result.resendCooldownSeconds,
        // Only present outside production with the mock SMS provider.
        ...(result.devCode ? { devCode: result.devCode } : {})
      },
      message: 'کد تأیید ارسال شد.'
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// OTP: verify the code. Logs the user in, or registers them on first success.
// ---------------------------------------------------------------------------
router.post('/otp/verify', validate(otpVerifySchema), (req, res) => {
  const { mobile, code } = req.body;
  const result = verifyOtp({ mobile, code });

  if (!result.ok) {
    return res.status(401).json({
      success: false,
      error: result.reason,
      message: result.message,
      ...(result.remainingAttempts !== undefined ? { remainingAttempts: result.remainingAttempts } : {})
    });
  }

  // First successful verification creates the account (mobile acts as identity).
  let user = db.findUserByPhone(mobile);
  let isNewUser = false;

  if (!user) {
    user = db.createUser({
      fullName: result.fullName || `کاربر ${mobile.slice(-4)}`,
      phone: mobile,
      email: `${mobile}@manto-moda.ir`,
      passwordHash: null, // passwordless account; login happens through OTP
      role: 'REGULAR',
      isWholesaleVerified: false
    });
    isNewUser = true;
  }

  const token = signToken(user);

  res.json({
    success: true,
    data: {
      token,
      isNewUser,
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
    message: isNewUser ? 'حساب شما با موفقیت ساخته شد.' : 'ورود با موفقیت انجام شد.'
  });
});

// OTP policy (public: the client shows the countdown/TTL to the user)
router.get('/otp/policy', (req, res) => {
  res.json({ success: true, data: OTP_CONFIG });
});

// Current User Profile
router.get('/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    data: req.user
  });
});

// Switch Role Simulator Endpoint (Issues real cryptographic signed JWTs for selected roles)
//
// SECURITY (ADR-024): this endpoint signs a token for whatever role is asked
// for, without a password — which is exactly what a demo needs and exactly what
// must never exist on a live shop. It answered from the public internet in
// production and handed out an ADMIN token to anyone. It is now absent unless
// the deployment explicitly opted into demo mode, and a 404 is returned rather
// than a 403 so the endpoint does not advertise that it exists.
router.post('/switch-role', (req, res) => {
  if (!demoModeEnabled()) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'مسیر مورد نظر یافت نشد.' });
  }

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

  const token = signToken(targetUser);

  res.json({
    success: true,
    data: {
      token,
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
