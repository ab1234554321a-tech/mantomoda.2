import assert from 'assert';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Level 10 — production guards (ADR-024).
 *
 * The project was built as a showcase, and some of its scaffolding is fatal on a
 * live shop: `POST /api/auth/switch-role` signed a token for any role without a
 * password (an anonymous visitor could become ADMIN from the internet), and the
 * demo accounts share a password that is published in this public repository.
 *
 * These guards live *behind* NODE_ENV, and every module here reads the
 * environment at import time, so a spawned process is the honest way to test
 * them: importing the app inside this (test-mode) process would prove nothing.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');

const BASE_ENV = {
  NODE_ENV: 'production',
  JWT_SECRET: 'production_guard_test_secret_long_enough_1234567890',
  PAYMENT_PROVIDER: 'mock',
  SMS_PROVIDER: 'mock',
  ALLOW_MOCK_PROVIDERS: 'true',
  PERSIST_DATA: 'true',
  PUBLIC_SITE_URL: 'https://shop.example.ir'
};

const OWNER = { email: 'owner@example.ir', password: 'a-long-owner-password-1' };

/** Boots the real server on a random port and waits until it answers or dies. */
function bootServer({ env = {}, expectFailure = false } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manto-guard-'));
  const childEnv = { ...process.env, ...BASE_ENV, ...env, DATA_DIR: dataDir };
  delete childEnv.PORT; // the test decides the port

  // A real port: index.js logs what it was told to use, so the test waits for
  // that number rather than guessing. The range is high and randomised to stay
  // clear of anything the developer is already running.
  const port = 41000 + Math.floor(Math.random() * 15000);
  const child = spawn(process.execPath, ['src/server/index.js'], {
    cwd: ROOT,
    env: { ...childEnv, PORT: String(port) }
  });

  let out = '';
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.stderr.on('data', (d) => { out += d.toString(); });

  if (expectFailure) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({ failed: false, output: out });
      }, 10000);
      child.on('close', () => {
        clearTimeout(timer);
        resolve({ failed: true, output: out });
      });
    });
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`server did not start in time:\n${out}`));
    }, 15000);

    const check = setInterval(async () => {
      if (!out.includes('Server running')) return;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (res.ok) {
          clearTimeout(timer);
          clearInterval(check);
          resolve({ child, port, output: out, dataDir });
        }
      } catch { /* not listening yet */ }
    }, 250);
  });
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((r) => {
    const t = setTimeout(() => { child.kill('SIGKILL'); r(); }, 4000);
    child.on('close', () => { clearTimeout(t); r(); });
  });
}

export async function runProductionGuardTests() {
  console.log('\n🛡️  Running Production Guard Tests — demo scaffolding off a live shop (ADR-024)...');

  // --- 1. The role simulator must not exist on a live shop ---------------
  const live = await bootServer({ env: { ADMIN_EMAIL: OWNER.email, ADMIN_PASSWORD: OWNER.password } });
  try {
    const base = `http://127.0.0.1:${live.port}`;

    const switchRes = await fetch(`${base}/api/auth/switch-role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetRole: 'ADMIN' })
    });
    assert.strictEqual(switchRes.status, 404,
      'the role simulator must be absent (404) in production — it hands out admin tokens without a password');
    console.log('  ✔ Passed: role simulator is gone in production (404, not 403 — it does not advertise itself).');

    // --- 2. The published demo password must not open anything -----------
    for (const [identifier, password] of [
      ['admin@manto.ir', 'password123'],
      ['neda.alavi@gmail.com', 'password123'],
      ['boutique.tehran@manto.ir', 'password123']
    ]) {
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });
      assert.strictEqual(res.status, 401,
        `demo account ${identifier} must not be able to log in to a live shop`);
      const body = await res.json();
      assert.strictEqual(body.error, 'INVALID_CREDENTIALS',
        'the refusal must look like any other wrong password (no account enumeration)');
    }
    console.log('  ✔ Passed: published demo credentials are refused like any other wrong password.');

    // --- 3. The owner's own account works -------------------------------
    const ownerLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: OWNER.email, password: OWNER.password })
    });
    assert.strictEqual(ownerLogin.status, 200, 'the owner account from the environment can log in');
    const owner = await ownerLogin.json();
    assert.strictEqual(owner.data.user.role, 'ADMIN', 'and it is an admin');
    assert.ok(!owner.data.user.isDemo, 'never flagged as demo');

    const adminRes = await fetch(`${base}/api/admin/orders`, {
      headers: { Authorization: `Bearer ${owner.data.token}` }
    });
    assert.strictEqual(adminRes.status, 200, 'and it can read the back office');
    console.log('  ✔ Passed: the owner account from ADMIN_EMAIL/ADMIN_PASSWORD signs in and reaches the back office.');

    // --- 4. A live shop starts clean ------------------------------------
    const products = await (await fetch(`${base}/api/products`)).json();
    assert.strictEqual((products.data || []).length, 0,
      'a live shop must not open with the sample catalogue already in it');

    const stats = await (await fetch(`${base}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${owner.data.token}` }
    })).json();
    assert.strictEqual(stats.data.revenueAllTime, 0,
      'and the dashboard must not show invented revenue from sample orders');
    assert.ok(!JSON.stringify(stats.data).includes('مشتری نمونه'),
      'no sample customer record may be present');
    console.log('  ✔ Passed: a fresh live shop is empty — no sample catalogue, orders or customers.');

    // --- 5. The client can tell the difference ---------------------------
    const cfg = await (await fetch(`${base}/api/config`)).json();
    assert.strictEqual(cfg.data.demoMode, false, '/api/config tells the client demo mode is off');
    assert.strictEqual(cfg.data.environment, 'production', 'and which environment it is');
    const health = await (await fetch(`${base}/api/health`)).json();
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.strictEqual(health.version, pkg.version,
      'the reported version must come from package.json (it drifted one release behind before)');
    assert.strictEqual(health.demoMode, false, 'health repeats the demo mode');
    console.log(`  ✔ Passed: /api/config + /api/health report demoMode false and version ${health.version}.`);

    // --- 6. Defence in depth: a token for a demo user is inert ----------
    // Simulate an old token from before these guards existed.
    const { db } = await import('../src/server/db/store.js');
    const demoish = {
      id: 'usr-legacy-demo', email: 'legacy@demo.local', phone: '09120000000',
      fullName: 'حساب قدیمی', role: 'ADMIN', isWholesaleVerified: true, isDemo: true
    };
    db.users.push(demoish);
    const { signToken } = await import('../src/server/utils/auth-crypto.js');
    const legacyToken = signToken(demoish);
    const legacyRes = await fetch(`${base}/api/admin/orders`, {
      headers: { Authorization: `Bearer ${legacyToken}` }
    });
    assert.strictEqual(legacyRes.status, 401,
      'a token belonging to a demo account must be rejected even if it is validly signed');
    db.users = db.users.filter((u) => u.id !== demoish.id);
    console.log('  ✔ Passed: a validly signed token for a demo account is inert on a live shop.');
  } finally {
    await stop(live.child);
  }

  // --- 7. A live shop refuses to start without an owner account ---------
  const refused = await bootServer({ env: { ADMIN_EMAIL: '', ADMIN_PASSWORD: '' }, expectFailure: true });
  assert.ok(refused.failed, 'production must not start without ADMIN_EMAIL/ADMIN_PASSWORD');
  assert.ok(/ADMIN_EMAIL و ADMIN_PASSWORD/.test(refused.output),
    'the refusal must say exactly what is missing');
  console.log('  ✔ Passed: production refuses to boot without an owner account, with an actionable message.');

  const shortPassword = await bootServer({
    env: { ADMIN_EMAIL: OWNER.email, ADMIN_PASSWORD: 'short' },
    expectFailure: true
  });
  assert.ok(shortPassword.failed, 'production must not start with a weak owner password');
  assert.ok(/حداقل ۱۲ کاراکتر/.test(shortPassword.output), 'and must say what is wrong with it');
  console.log('  ✔ Passed: a weak ADMIN_PASSWORD is refused at boot.');

  // --- 8. The demo experience still works where it belongs -------------
  for (const mode of ['development', 'test']) {
    const demo = await bootServer({ env: { NODE_ENV: mode } });
    try {
      const base = `http://127.0.0.1:${demo.port}`;
      const cfg = await (await fetch(`${base}/api/config`)).json();
      assert.strictEqual(cfg.data.demoMode, true, `demo mode must stay available in ${mode}`);
      const switchRes = await fetch(`${base}/api/auth/switch-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRole: 'ADMIN' })
      });
      assert.strictEqual(switchRes.status, 200, `the role simulator must work in ${mode}`);
      const products = await (await fetch(`${base}/api/products`)).json();
      assert.ok((products.data || []).length > 0, `the sample catalogue must load in ${mode}`);
    } finally {
      await stop(demo.child);
    }
  }
  console.log('  ✔ Passed: development and test keep the full demo experience (role switcher + sample catalogue).');
}
