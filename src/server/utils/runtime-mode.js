import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runtime mode — the single place that decides what a *production* deployment is
 * allowed to do.
 *
 * Why this file exists (ADR-024): the project was built as a showcase, and some
 * of that showcase scaffolding is dangerous on a live shop. The role switcher
 * hands out a signed admin token to anyone who asks, and the demo accounts share
 * a password that is printed in this public repository. Both were fine in a demo
 * and both were reachable from the internet the moment the shop was deployed.
 *
 * The rule is therefore centralised instead of being sprinkled as environment
 * checks: demo behaviour is *off by default in production*, needs an explicit
 * opt-in to come back, and every guard reads the answer from here so the
 * behaviour cannot drift between the routes, the middleware and the client.
 */

const PRODUCTION = process.env.NODE_ENV === 'production';

/** True when the process is a real deployment (NODE_ENV=production). */
export function isProduction() {
  return PRODUCTION;
}

/**
 * Are the demo/simulator features available?
 *  - development & test: always (that is what they are for)
 *  - production: only with an explicit `ALLOW_DEMO_MODE=true`
 *    (a temporary staged demo; `scripts/preflight.sh` flags it loudly)
 */
export function demoModeEnabled() {
  if (!PRODUCTION) return true;
  return process.env.ALLOW_DEMO_MODE === 'true';
}

/**
 * Should the sample catalogue, sample orders and sample accounts be loaded?
 *  - development & test: always
 *  - production: only with `SEED_DEMO_DATA=true`; a real shop starts with its own
 *    catalogue, and shipping invented orders and customer records into a live
 *    back office is both confusing and a data-protection problem
 */
export function demoDataEnabled() {
  if (!PRODUCTION) return true;
  return process.env.SEED_DEMO_DATA === 'true';
}

/** The owner's own admin account, taken from the environment in production. */
export function ownerAccount() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  return {
    email,
    password,
    configured: Boolean(email && password)
  };
}

/**
 * Boot-time guard. Production must not start without a real owner account,
 * because the alternative is a shop whose only admin is a demo login published
 * on GitHub. Failing loudly here is the same policy the app already applies to
 * unconfigured payment and SMS providers.
 */
export function assertProductionReady() {
  if (!PRODUCTION) return;

  const problems = [];
  const { email, password, configured } = ownerAccount();

  if (!configured) {
    problems.push(
      'ADMIN_EMAIL و ADMIN_PASSWORD تنظیم نشده‌اند — بدون آن‌ها هیچ راه ورود امنی برای مدیر وجود ندارد\n' +
      '    (اسکریپت نصب سرور این دو را خودش می‌سازد و در پایان نمایش می‌دهد: bash scripts/server-install.sh)'
    );
  } else if (password.length < 12) {
    problems.push('ADMIN_PASSWORD باید حداقل ۱۲ کاراکتر باشد');
  }

  if (process.env.ALLOW_DEMO_MODE === 'true') {
    console.warn('[Manto Moda] ⚠ ALLOW_DEMO_MODE=true — ابزار شبیه‌ساز نقش فعال است (فقط برای دموی موقت سرور)');
  }
  if (process.env.SEED_DEMO_DATA === 'true') {
    console.warn('[Manto Moda] ⚠ SEED_DEMO_DATA=true — کاتالوگ و سفارش‌های نمونه در فروشگاه واقعی بارگذاری می‌شوند');
  }

  if (problems.length) {
    const message =
      '\n[Manto Moda] راه‌اندازی در حالت production متوقف شد:\n  - ' + problems.join('\n  - ') +
      '\n\n  برای شروع سریع روی سرور:\n' +
      '    DOMAIN=your-domain bash scripts/server-install.sh\n';
    throw new Error(message);
  }
}

/** The application version, read from package.json so it cannot drift. */
export function appVersion() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', '..', '..', 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Everything a client needs to know about this deployment (no secrets). */
export function publicRuntimeConfig() {
  return {
    version: appVersion(),
    environment: process.env.NODE_ENV || 'development',
    demoMode: demoModeEnabled(),
    demoData: demoDataEnabled()
  };
}
