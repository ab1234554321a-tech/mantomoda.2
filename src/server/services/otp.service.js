// =============================================================================
//  OTP Service (BL-007 / TD-003)
//  Mobile verification codes for registration and passwordless login.
//
//  Security properties enforced here (and covered by tests/otp.test.js):
//    1. Codes are never stored in plaintext — only a salted SHA-256 digest.
//    2. Single use: a verified code is destroyed immediately.
//    3. Short TTL (default 120s).
//    4. Brute-force protection: max 5 verification attempts per code.
//    5. Resend throttling: cooldown between sends + hourly ceiling per number.
//    6. The code is never returned in an API response in production.
//
//  Records live in the data layer (src/server/db/store.js) so the move to
//  Redis/PostgreSQL does not require rewriting this service.
// =============================================================================
import crypto from 'crypto';
import { db } from '../db/store.js';
import { getSmsProvider } from './sms/provider.js';

const CODE_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS || 120);
const MAX_VERIFY_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60);
const MAX_SENDS_PER_WINDOW = Number(process.env.OTP_MAX_SENDS_PER_HOUR || 5);
const SEND_WINDOW_SECONDS = 3600;

function hashCode(code, salt) {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'hex');
  const bufB = Buffer.from(String(b), 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * The generated code is echoed back to the caller only when the environment is
 * non-production AND the message was not actually dispatched (mock provider).
 * This keeps local development possible without weakening production.
 */
function shouldExposeCode(providerName) {
  return providerName === 'mock' && process.env.NODE_ENV !== 'production';
}

export function isDevelopmentCodeExposed() {
  return shouldExposeCode(getSmsProvider().name);
}

/**
 * Request an OTP for a mobile number.
 * Returns { ok, expiresInSeconds, devCode? } or throws an Error with
 * statusCode/code for the error-handler pipeline.
 */
export async function requestOtp({ mobile, fullName }) {
  const now = Date.now();
  const existing = db.findOtpByMobile(mobile);

  if (existing) {
    const secondsSinceLastSend = (now - new Date(existing.lastSentAt).getTime()) / 1000;

    if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLastSend);
      throw Object.assign(
        new Error(`تا ${wait} ثانیه دیگر نمی‌توانید کد جدید درخواست کنید.`),
        { statusCode: 429, code: 'OTP_RESEND_COOLDOWN', retryAfterSeconds: wait }
      );
    }

    const windowStart = new Date(existing.sendWindowStartedAt).getTime();
    const withinWindow = (now - windowStart) / 1000 < SEND_WINDOW_SECONDS;

    if (withinWindow && existing.sendCount >= MAX_SENDS_PER_WINDOW) {
      throw Object.assign(
        new Error('تعداد درخواست کد برای این شماره بیش از حد مجاز است. لطفاً بعداً تلاش کنید.'),
        { statusCode: 429, code: 'OTP_RATE_LIMITED' }
      );
    }
  }

  const code = String(crypto.randomInt(100000, 1000000)); // 6 digits, CSPRNG
  const salt = crypto.randomBytes(16).toString('hex');

  const withinWindow = existing &&
    (now - new Date(existing.sendWindowStartedAt).getTime()) / 1000 < SEND_WINDOW_SECONDS;

  db.saveOtpRecord(mobile, {
    codeHash: hashCode(code, salt),
    salt,
    expiresAt: new Date(now + CODE_TTL_SECONDS * 1000).toISOString(),
    attempts: 0,
    lastSentAt: new Date(now).toISOString(),
    sendCount: withinWindow ? existing.sendCount + 1 : 1,
    sendWindowStartedAt: withinWindow ? existing.sendWindowStartedAt : new Date(now).toISOString(),
    fullName: fullName || existing?.fullName || ''
  });

  const { name: providerName, adapter } = getSmsProvider();

  // If delivery fails the code record is destroyed so the user is not left
  // with a valid-but-undelivered code, and the failure surfaces as a 502.
  try {
    await adapter.sendOtp({ mobile, code, template: process.env.KAVENEGAR_OTP_TEMPLATE });
  } catch (error) {
    db.deleteOtpByMobile(mobile);
    throw Object.assign(error, {
      statusCode: error.statusCode || 502,
      code: error.code || 'OTP_DELIVERY_FAILED'
    });
  }

  return {
    ok: true,
    expiresInSeconds: CODE_TTL_SECONDS,
    resendCooldownSeconds: RESEND_COOLDOWN_SECONDS,
    ...(shouldExposeCode(providerName) ? { devCode: code } : {})
  };
}

/**
 * Verify an OTP. On success the record is consumed (single use).
 * Returns { ok: true } or { ok: false, reason }.
 */
export function verifyOtp({ mobile, code }) {
  const record = db.findOtpByMobile(mobile);

  if (!record) {
    return { ok: false, reason: 'NOT_FOUND', message: 'کدی برای این شماره ثبت نشده است. لطفاً کد جدید درخواست کنید.' };
  }

  if (new Date(record.expiresAt).getTime() < Date.now()) {
    db.deleteOtpByMobile(mobile);
    return { ok: false, reason: 'EXPIRED', message: 'کد وارد شده منقضی شده است. لطفاً کد جدید درخواست کنید.' };
  }

  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    db.deleteOtpByMobile(mobile);
    return { ok: false, reason: 'TOO_MANY_ATTEMPTS', message: 'تعداد تلاش‌های نادرست بیش از حد مجاز است. لطفاً کد جدید درخواست کنید.' };
  }

  const candidate = hashCode(code, record.salt);

  if (!safeEqual(candidate, record.codeHash)) {
    // Snapshot before incrementing: incrementOtpAttempts mutates the same
    // object reference, so reading record.attempts afterwards would be off by one.
    const attemptsBefore = record.attempts;
    db.incrementOtpAttempts(mobile);
    const remaining = Math.max(0, MAX_VERIFY_ATTEMPTS - (attemptsBefore + 1));
    return {
      ok: false,
      reason: 'INVALID_CODE',
      remainingAttempts: remaining,
      message: `کد وارد شده نادرست است. ${remaining} تلاش باقی مانده است.`
    };
  }

  // Single-use: consume immediately.
  db.deleteOtpByMobile(mobile);
  return { ok: true, fullName: record.fullName || '' };
}

export const OTP_CONFIG = {
  CODE_TTL_SECONDS,
  MAX_VERIFY_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  MAX_SENDS_PER_WINDOW
};
