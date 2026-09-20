#!/usr/bin/env node
/**
 * API contract check — keeps `openapi.yaml` and the Express app in step.
 *
 * Why this exists: this project already lost time to documentation that described
 * a different application than the one in the repository. An API contract is only
 * worth having if it is *true*, so this script derives the real surface from the
 * source (mount points in app.js + the router definitions) and fails when the
 * spec and the code disagree in either direction:
 *
 *   • a route exists in code but is missing from openapi.yaml   → undocumented API
 *   • openapi.yaml documents a route the app does not serve      → stale contract
 *
 * It is deliberately dependency-free (no YAML library): the spec is parsed with a
 * small reader limited to the `paths:` block, which is all this check needs.
 *
 * Usage:  node scripts/api-contract-check.mjs [--quiet]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(ROOT, 'openapi.yaml');
const APP = path.join(ROOT, 'src', 'server', 'app.js');
const ROUTES_DIR = path.join(ROOT, 'src', 'server', 'routes');
const quiet = process.argv.includes('--quiet');

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** `:id` → `{id}`, drop a trailing slash, keep the leading one. */
function normalise(routePath) {
  const withBraces = routePath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  const collapsed = withBraces.replace(/\/{2,}/g, '/');
  return collapsed.length > 1 ? collapsed.replace(/\/$/, '') : collapsed;
}

/** Every route the application actually serves, as "METHOD /path". */
function routesFromSource() {
  const app = fs.readFileSync(APP, 'utf8');
  const found = new Set();

  // 1. Mount points: app.use('/api/admin', …, adminRoutes)
  const mounts = new Map();
  const mountRe = /app\.use\(\s*'([^']+)'\s*,([^;]+?)\);/gs;
  let m;
  while ((m = mountRe.exec(app)) !== null) {
    for (const name of m[2].matchAll(/\b(\w+Routes)\b/g)) {
      mounts.set(name[1], m[1]);
    }
  }

  // 2. Router definitions inside each route module
  for (const file of fs.readdirSync(ROUTES_DIR)) {
    if (!file.endsWith('.routes.js')) continue;
    const moduleName = file.replace(/\.routes\.js$/, 'Routes');
    const prefix = mounts.get(moduleName);
    if (!prefix) {
      throw new Error(`route module ${file} is not mounted in app.js — cannot resolve its paths`);
    }
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
    for (const r of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      found.add(`${r[1].toUpperCase()} ${normalise(path.posix.join(prefix, r[2]))}`);
    }
  }

  // 3. Endpoints declared inline in app.js (health, config)
  for (const r of app.matchAll(/app\.(get|post|put|patch|delete)\(\s*'(\/api\/[^']*)'/g)) {
    found.add(`${r[1].toUpperCase()} ${normalise(r[2])}`);
  }

  return found;
}

/** The paths documented in openapi.yaml, as "METHOD /path". */
function routesFromSpec() {
  const text = fs.readFileSync(SPEC, 'utf8').split(/\r?\n/);
  const found = new Set();
  let inPaths = false;
  let currentPath = null;
  let pathIndent = -1;

  for (const line of text) {
    if (/^paths:\s*$/.test(line)) { inPaths = true; continue; }
    if (!inPaths) continue;
    if (/^\S/.test(line)) break; // a new top-level key ends the paths block

    const pathMatch = line.match(/^(\s+)['"]?(\/[^'":]*|['"]\/[^'"]*)['"]?:\s*$/);
    if (pathMatch) {
      pathIndent = pathMatch[1].length;
      currentPath = normalise(pathMatch[2].replace(/['"]/g, ''));
      continue;
    }
    const methodMatch = line.match(/^(\s+)([a-z]+):\s*$/);
    if (methodMatch && currentPath && pathIndent !== -1 && methodMatch[1].length === pathIndent + 2) {
      const verb = methodMatch[2];
      if (METHODS.includes(verb)) found.add(`${verb.toUpperCase()} ${currentPath}`);
    }
  }
  return found;
}

const inCode = routesFromSource();
const inSpec = routesFromSpec();

const undocumented = [...inCode].filter((r) => !inSpec.has(r)).sort();
const stale = [...inSpec].filter((r) => !inCode.has(r)).sort();

if (!quiet) {
  console.log('🔌 API contract check');
  console.log(`   routes in code: ${inCode.size}`);
  console.log(`   routes in spec: ${inSpec.size}`);
}

if (undocumented.length) {
  console.error('\n✘ served by the app but missing from openapi.yaml:');
  for (const r of undocumented) console.error(`   - ${r}`);
}
if (stale.length) {
  console.error('\n✘ documented in openapi.yaml but not served by the app:');
  for (const r of stale) console.error(`   - ${r}`);
}

if (undocumented.length || stale.length) {
  console.error('\nFix openapi.yaml so the contract matches the code, then run this check again.');
  process.exit(1);
}

if (!quiet) console.log('✅ API contract matches the implementation.');
