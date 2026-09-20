// =============================================================================
//  Persistence Layer (ADR-010)
//  File-backed snapshot of the in-memory store with atomic writes.
//
//  Why this exists: the data store used to live only in memory, so every server
//  restart erased all users, orders, wholesale approvals, OTP codes and payment
//  sessions. That made the shop unusable in practice.
//
//  Design constraints:
//    - The store interface does not change: routes keep calling db.* as before.
//      Swapping this file for PostgreSQL/Prisma later (BL-005) is a one-file job.
//    - Writes are ATOMIC (temp file + rename) so a crash mid-write cannot leave
//      a truncated snapshot that fails to load.
//    - Saves are debounced; a hard shutdown flushes synchronously.
//    - Persistence is disabled under NODE_ENV=test so suites stay hermetic.
// =============================================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAVE_DEBOUNCE_MS = Number(process.env.PERSIST_DEBOUNCE_MS || 150);

const STATE_KEYS = [
  'users',
  'applications',
  'categories',
  'products',
  'orders',
  'payments',
  'otps'
];

export function isPersistenceEnabled() {
  if (process.env.PERSIST_DATA === 'false') return false;
  if (process.env.NODE_ENV === 'test') return false;
  return true;
}

export function dataDir() {
  return process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(__dirname, '../../../data');
}

export function snapshotPath() {
  return path.join(dataDir(), 'manto-moda.json');
}

export function uploadsDir() {
  return process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(dataDir(), 'uploads');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Read the snapshot from disk.
 * Returns null when persistence is off, the file is missing, unreadable or
 * corrupt — the caller then falls back to seed data.
 */
export function loadSnapshot() {
  if (!isPersistenceEnabled()) return null;

  const file = snapshotPath();
  if (!fs.existsSync(file)) return null;

  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);

    if (process.env.RESET_DATA === 'true') {
      console.log('[Persistence] RESET_DATA=true — ignoring the existing snapshot and re-seeding.');
      return null;
    }

    const missing = STATE_KEYS.filter((k) => !Array.isArray(parsed[k]));
    if (missing.length > 0) {
      console.error(`[Persistence] Snapshot is missing collections: ${missing.join(', ')}. Falling back to seed data.`);
      return null;
    }

    console.log(`[Persistence] Loaded snapshot from ${file} (saved ${parsed.savedAt || 'unknown'}).`);
    return parsed;
  } catch (error) {
    console.error(`[Persistence] Could not read snapshot (${error.message}). Falling back to seed data.`);
    return null;
  }
}

/**
 * Atomically write a snapshot: write to a temp file, fsync, then rename over
 * the target. rename() is atomic on POSIX, so readers never see a half file.
 */
export function writeSnapshotSync(state) {
  if (!isPersistenceEnabled()) return false;

  const dir = dataDir();
  const target = snapshotPath();
  const tmp = `${target}.${process.pid}.tmp`;

  try {
    ensureDir(dir);

    const payload = { ...state, savedAt: new Date().toISOString(), version: 1 };
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');

    // Best-effort durability of the temp file before swapping it in.
    try {
      const fd = fs.openSync(tmp, 'r+');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
    } catch {
      /* fsync is not supported on every filesystem; the rename is what matters. */
    }

    fs.renameSync(tmp, target);
    return true;
  } catch (error) {
    console.error(`[Persistence] Snapshot write failed: ${error.message}`);
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* nothing else we can do */
    }
    return false;
  }
}

/**
 * Debounced saver. Coalesces bursts of mutations into a single disk write.
 */
export function createSaver(getState) {
  let timer = null;
  let pending = false;

  function saveNow() {
    pending = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    return writeSnapshotSync(getState());
  }

  return {
    schedule() {
      pending = true;
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        saveNow();
      }, SAVE_DEBOUNCE_MS);
      // Never keep the event loop alive just for a pending save.
      if (typeof timer.unref === 'function') timer.unref();
    },
    flush() {
      if (!pending) return false;
      return saveNow();
    },
    hasPendingWrites() {
      return pending;
    }
  };
}
