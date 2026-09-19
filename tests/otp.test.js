// =============================================================================
//  OTP / SMS Tests (BL-007 / TD-003 / ADR-009)
//  Covers hashing, single-use, TTL, brute-force limits, resend throttling
//  and provider registry behaviour.
// =============================================================================
import { requestOtp, verifyOtp, OTP_CONFIG } from '../src/server/services/otp.service.js';
import { getSmsProvider, SMS_PROVIDERS, SMS_PROVIDER_CONTRACT } from '../src/server/services/sms/provider.js';
import { kavenegarProvider } from '../src/server/services/sms/kavenegar.provider.js';
import { mockSmsProvider } from '../src/server/services/sms/mock.provider.js';
import { db } from '../src/server/db/store.js';

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
  console.log(`  ✔ Passed: ${message}`);
}

const MOBILE = '09121234567';

export async function runOtpTests() {
  console.log('\n📱 Running OTP / SMS Verification Tests (BL-007)...');
  mockSmsProvider._reset();
  db.deleteOtpByMobile(MOBILE);

  // --- Provider registry ---
  assert(Object.keys(SMS_PROVIDERS).includes('kavenegar'), 'Kavenegar is registered as the default SMS provider');
  assert(Object.keys(SMS_PROVIDERS).includes('mock'), 'Mock SMS provider is registered for offline testing');
  for (const method of SMS_PROVIDER_CONTRACT) {
    assert(
      typeof SMS_PROVIDERS.kavenegar[method] === 'function' && typeof SMS_PROVIDERS.mock[method] === 'function',
      `Both SMS providers implement the "${method}" contract method`
    );
  }
  assert(kavenegarProvider.isConfigured() === false, 'Kavenegar reports unconfigured without an API key');
  assert(
    kavenegarProvider.missingConfig().includes('KAVENEGAR_API_KEY') && kavenegarProvider.missingConfig().includes('KAVENEGAR_SENDER'),
    'Missing SMS config lists both API key and sender number'
  );

  let smsConfigError = null;
  const envBefore = process.env.NODE_ENV;
  try {
    process.env.SMS_PROVIDER = 'kavenegar';
    process.env.NODE_ENV = 'production';
    getSmsProvider();
  } catch (error) {
    smsConfigError = error;
  } finally {
    delete process.env.SMS_PROVIDER;
    process.env.NODE_ENV = envBefore;
  }
  assert(smsConfigError !== null, 'Selecting an unconfigured SMS provider throws at startup instead of silently dropping codes');

  assert(getSmsProvider().name === 'mock', 'Test environment automatically uses the mock SMS provider');

  // --- Request a code ---
  const request = await requestOtp({ mobile: MOBILE, fullName: 'کاربر آزمایشی' });
  assert(request.ok === true, 'OTP request succeeds with the mock provider');
  assert(request.expiresInSeconds === OTP_CONFIG.CODE_TTL_SECONDS, 'Response reports the configured code TTL');
  assert(/^\d{6}$/.test(request.devCode || ''), 'Generated code is exactly 6 digits');
  assert(mockSmsProvider._outbox().length === 1, 'Exactly one SMS was dispatched');
  assert(mockSmsProvider._outbox()[0].to === MOBILE, 'SMS was sent to the requested mobile number');

  const code = request.devCode;
  const stored = db.findOtpByMobile(MOBILE);

  // --- Storage security ---
  assert(stored !== null, 'An OTP record exists for the mobile number');
  assert(stored.codeHash !== code, 'The plaintext code is never stored');
  assert(!JSON.stringify(stored).includes(code), 'The plaintext code appears nowhere in the stored record');
  assert(typeof stored.salt === 'string' && stored.salt.length >= 16, 'A random per-record salt is stored alongside the digest');
  assert(stored.codeHash.length === 64, 'The stored digest is a SHA-256 hash');

  // --- Wrong code (and brute-force counter) ---
  const wrong = verifyOtp({ mobile: MOBILE, code: '000000' });
  assert(wrong.ok === false && wrong.reason === 'INVALID_CODE', 'A wrong code is rejected');
  assert(wrong.remainingAttempts === OTP_CONFIG.MAX_VERIFY_ATTEMPTS - 1, 'Failed attempts are counted and remaining attempts reported');
  assert(db.findOtpByMobile(MOBILE).attempts === 1, 'Attempt counter is persisted on the OTP record');

  // --- Correct code ---
  const success = verifyOtp({ mobile: MOBILE, code });
  assert(success.ok === true, 'The correct code verifies successfully');

  // --- Single use ---
  const replay = verifyOtp({ mobile: MOBILE, code });
  assert(replay.ok === false && replay.reason === 'NOT_FOUND', 'A used code cannot be replayed (single-use enforced)');
  assert(db.findOtpByMobile(MOBILE) === null, 'The OTP record is destroyed after successful verification');

  // --- Resend cooldown ---
  const afterConsume = await requestOtp({ mobile: MOBILE });
  let cooldownError = null;
  try {
    await requestOtp({ mobile: MOBILE });
  } catch (error) {
    cooldownError = error;
  }
  assert(
    cooldownError !== null && cooldownError.code === 'OTP_RESEND_COOLDOWN',
    `Resending within the ${OTP_CONFIG.RESEND_COOLDOWN_SECONDS}s cooldown is refused`
  );
  assert(mockSmsProvider._outbox().length === 2, 'Refused resends do not dispatch an SMS');

  // --- Expiry ---
  db.saveOtpRecord('09350000000', {
    codeHash: 'deadbeef', salt: 'salt', expiresAt: new Date(Date.now() - 1000).toISOString(),
    attempts: 0, lastSentAt: new Date().toISOString(), sendCount: 1, sendWindowStartedAt: new Date().toISOString()
  });
  const expired = verifyOtp({ mobile: '09350000000', code: '123456' });
  assert(expired.ok === false && expired.reason === 'EXPIRED', 'Expired codes are rejected');
  assert(db.findOtpByMobile('09350000000') === null, 'Expired records are purged on verification attempt');

  // --- Attempt ceiling ---
  db.saveOtpRecord('09360000000', {
    codeHash: 'deadbeef', salt: 'salt', expiresAt: new Date(Date.now() + 60000).toISOString(),
    attempts: OTP_CONFIG.MAX_VERIFY_ATTEMPTS, lastSentAt: new Date().toISOString(), sendCount: 1, sendWindowStartedAt: new Date().toISOString()
  });
  const locked = verifyOtp({ mobile: '09360000000', code: '123456' });
  assert(locked.ok === false && locked.reason === 'TOO_MANY_ATTEMPTS', `Codes are locked out after ${OTP_CONFIG.MAX_VERIFY_ATTEMPTS} failed attempts`);

  // --- Hourly send ceiling ---
  db.saveOtpRecord('09370000000', {
    codeHash: 'x', salt: 'y', expiresAt: new Date(Date.now() + 60000).toISOString(),
    attempts: 0, lastSentAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    sendCount: OTP_CONFIG.MAX_SENDS_PER_WINDOW, sendWindowStartedAt: new Date().toISOString()
  });
  let rateError = null;
  try {
    await requestOtp({ mobile: '09370000000' });
  } catch (error) {
    rateError = error;
  }
  assert(rateError !== null && rateError.code === 'OTP_RATE_LIMITED', 'Hourly per-number send ceiling is enforced against SMS pumping abuse');

  // --- No leak in production mode ---
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  process.env.SMS_PROVIDER = 'mock'; // explicitly selected: production refuses to guess a provider
  const prodRequest = await requestOtp({ mobile: '09380000000' });
  assert(prodRequest.devCode === undefined, 'The code is never echoed back in a production response, even with the mock provider');
  assert(prodRequest.expiresInSeconds > 0, 'Production request still returns only non-sensitive metadata');
  process.env.NODE_ENV = previousEnv;
  delete process.env.SMS_PROVIDER;

  // --- Cleanup helper ---
  assert(db.purgeExpiredOtps() === 0, 'Expired-OTP purge runs without removing live records');
}
