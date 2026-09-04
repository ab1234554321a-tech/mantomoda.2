import { db } from '../db/store.js';

// Auth middleware extracting user from Authorization header or session token
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const sessionUserId = req.headers['x-user-id'];

  let userId = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // Decode simulated token formatted as `token_<userId>`
    if (token.startsWith('token_')) {
      userId = token.replace('token_', '');
    } else {
      userId = token;
    }
  } else if (sessionUserId) {
    userId = sessionUserId;
  }

  if (userId) {
    const user = db.findUserById(userId);
    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        phone: user.phone,
        fullName: user.fullName,
        role: user.role,
        isWholesaleVerified: user.isWholesaleVerified,
        companyName: user.companyName || ''
      };
    }
  }

  next();
}

// Require authenticated user
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'لطفاً ابتدا وارد حساب کاربری خود شوید.'
    });
  }
  next();
}

// Require specific role(s)
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'احراز هویت الزامی است.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'شما دسترسی لازم برای مشاهده یا انجام این عملیات را ندارید.'
      });
    }

    if (req.user.role === 'WHOLESALE' && !req.user.isWholesaleVerified && !allowedRoles.includes('REGULAR')) {
      return res.status(403).json({
        success: false,
        error: 'WHOLESALE_NOT_VERIFIED',
        message: 'حساب عمده‌فروشی شما هنوز به تایید مدیریت نرسیده است.'
      });
    }

    next();
  };
}
