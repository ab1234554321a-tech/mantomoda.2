import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'manto-moda-production-secret-key-2026-secure-jwt';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const SALT_ROUNDS = 10;

/**
 * Hash plain-text password using bcrypt
 */
export async function hashPassword(plainPassword) {
  if (!plainPassword) throw new Error('Password is required for hashing');
  return await bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/**
 * Compare plain-text password with stored bcrypt hash
 */
export async function comparePassword(plainPassword, hashedPassword) {
  if (!plainPassword || !hashedPassword) return false;
  return await bcrypt.compare(plainPassword, hashedPassword);
}

/**
 * Cryptographically sign JWT token
 */
export function signToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    phone: user.phone,
    fullName: user.fullName,
    role: user.role,
    isWholesaleVerified: Boolean(user.isWholesaleVerified)
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: 'HS256'
  });
}

/**
 * Verify and decode JWT token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    return null;
  }
}
