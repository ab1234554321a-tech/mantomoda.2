import assert from 'assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../src/server/app.js';

/**
 * Level 11 — authorization sweep over the whole back office.
 *
 * Levels 3 and 4 check specific endpoints (price leakage, BOLA on orders). This
 * suite is the blanket: it *derives* every route mounted under /api/admin from
 * the source and asserts that none of them answers a retail customer, so a route
 * added next month is covered without anyone remembering to update a list.
 *
 * A manually maintained list would rot; the route table cannot.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const app = createApp();

/** Every "/api/admin/…" route the app serves, as "METHOD /path". */
function adminRoutes() {
  const routes = [];
  const files = ['admin.routes.js', 'upload.routes.js'];
  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'server', 'routes', file), 'utf8');
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      const routePath = `/api/admin${m[2] === '/' ? '' : m[2]}`.replace(/\/{2,}/g, '/');
      routes.push({ method: m[1].toUpperCase(), path: routePath.replace(/:([A-Za-z0-9_]+)/g, 'ROUTEID') });
    }
  }
  return routes;
}

async function tokenFor(role) {
  const res = await request(app).post('/api/auth/switch-role').send({ targetRole: role });
  return res.body.data.token;
}

export async function runAuthorizationTests() {
  console.log('\n🚪 Running Authorization Sweep — every back-office route (Level 11)...');

  const routes = adminRoutes();
  assert.ok(routes.length >= 20, `expected the back-office route table (found ${routes.length})`);

  const retail = await tokenFor('REGULAR');
  const wholesale = await tokenFor('WHOLESALE');

  const leaks = [];
  for (const { method, path: p } of routes) {
    const url = p.replace('ROUTEID', 'does-not-exist');
    for (const [label, token] of [['anonymous', null], ['retail', retail], ['wholesale', wholesale]]) {
      const res = await request(app)
        [method.toLowerCase()](url)
        .set(token ? { Authorization: `Bearer ${token}` } : {})
        .send({});
      if (![400, 401, 403, 404, 413, 422].includes(res.status)) {
        leaks.push(`${label} reached ${method} ${p} → HTTP ${res.status}`);
      }
    }
  }

  assert.deepStrictEqual(leaks, [],
    `back-office routes must never answer a non-admin:\n    ${leaks.join('\n    ')}`);
  console.log(`  ✔ Passed: all ${routes.length} back-office routes refuse anonymous, retail and wholesale callers.`);

  // A retail token must not pass the role check even with a valid signature.
  const forgedRole = await request(app)
    .get('/api/admin/orders')
    .set('Authorization', `Bearer ${retail}`);
  assert.strictEqual(forgedRole.status, 403, 'a valid retail token is 403 — authenticated, not allowed');
  const anonymous = await request(app).get('/api/admin/orders');
  assert.strictEqual(anonymous.status, 401, 'no token at all is 401');
  console.log('  ✔ Passed: 401 without a token, 403 with the wrong role — the two are not conflated.');

  // The positive control: an admin really can use the same route.
  const admin = await tokenFor('ADMIN');
  const allowed = await request(app).get('/api/admin/orders').set('Authorization', `Bearer ${admin}`);
  assert.strictEqual(allowed.status, 200, 'the admin role reaches the same route (the guard is not a blanket "deny")');
  console.log('  ✔ Passed: the admin role reaches the same routes (the guard denies, it does not break).');

  // Public routes that must stay public — a guard added too broadly would be a
  // silent business outage, so they are asserted too.
  const publicPaths = ['/api/products', '/api/products/categories', '/api/config', '/api/health', '/sitemap.xml', '/robots.txt'];
  for (const p of publicPaths) {
    const res = await request(app).get(p);
    assert.ok(res.status === 200, `${p} must stay public (got ${res.status})`);
  }
  console.log('  ✔ Passed: the public surface (catalogue, config, health, SEO) is still open.');
}
