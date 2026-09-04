import { db } from '../db/store.js';
import { verifyToken } from '../utils/auth-crypto.js';

/**
 * Global Authentication Context Extractor
 * 
 * SECURITY FIX:
 * 1. COMPLETELY REMOVED `x-user-id` header to eliminate user impersonation & spoofing vulnerabilities.
 * 2. Enforces cryptographically signed and verifiable HMAC-SHA256 JWT tokens.
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();

    if (token) {
      const decoded = verifyToken(token);
      if (decoded && decoded.id) {
        const user = db.findUserById(decoded.id);
        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            phone: user.phone,
            fullName: user.fullName,
            role: user.role,
            isWholesaleVerified: Boolean(user.isWholesaleVerified),
            companyName: user.companyName || ''
          };
        }
      }
    }
  }

  next();
}

/**
 * Guard middleware requiring authenticated user
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'توکن نامعتبر است یا منقضی شده است. لطفاً ابتدا وارد حساب کاربری خود شوید.'
    });
  }
  next();
}

/**
 * Guard middleware requiring specific role(s)
 */
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
