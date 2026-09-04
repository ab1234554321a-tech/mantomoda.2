import 'dotenv/config';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const PLACEHOLDER_SECRETS = new Set([
  'your_super_secret_jwt_key_here_minimum_32_characters',
  'manto-moda-production-secret-key-2026-secure-jwt'
]);

function resolveJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;

  // Tests get a fresh random secret each run so the suite never needs a real one.
  if (!fromEnv && (process.env.NODE_ENV === 'test' || !process.env.NODE_ENV)) {
    return crypto.randomBytes(32).toString('hex');
  }

  if (!fromEnv || fromEnv.length < 32 || PLACEHOLDER_SECRETS.has(fromEnv)) {
    if (process.env.NODE_ENV === 'test') {
      return crypto.randomBytes(32).toString('hex');
    }
    throw new Error(
      'JWT_SECRET is missing, too short, or still set to the placeholder value. ' +
      'Set a real, random secret (32+ characters) in your environment before starting the server. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }

  return fromEnv;
}

const JWT_SECRET = resolveJwtSecret();
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
