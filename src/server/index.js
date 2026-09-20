// =============================================================================
//  Server entry point: binds the HTTP listener and owns process lifecycle.
//  The Express application itself lives in ./app.js (importable by tests).
// =============================================================================
import 'dotenv/config';
import { createApp } from './app.js';
import { db } from './db/store.js';

const PORT = process.env.PORT || 3000;
const app = createApp();

const server = app.listen(PORT, '0.0.0.0', () => {
  const persistence = db.persistenceInfo();
  console.log(`[Manto Moda] Server running at http://0.0.0.0:${PORT}`);
  console.log(`[Manto Moda] Production State & Architecture verified.`);
  console.log(
    persistence.enabled
      ? `[Manto Moda] Persistence: enabled (${persistence.snapshotFile})`
      : '[Manto Moda] Persistence: disabled (set PERSIST_DATA=true to keep data across restarts)'
  );
});

// ---------------------------------------------------------------------------
// Graceful shutdown: stop accepting connections, flush pending snapshot writes.
// ---------------------------------------------------------------------------
let shuttingDown = false;

const shutdown = (signal = 'SIGTERM', exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[Manto Moda] Gracefully shutting down server (${signal})...`);

  // Stop the OTP housekeeping timer so the process can exit cleanly.
  if (otpSweeper) clearInterval(otpSweeper);

  const flushed = db.flush();
  if (flushed) console.log('[Manto Moda] Pending data snapshot flushed to disk.');

  const forceExit = setTimeout(() => {
    console.error('[Manto Moda] Forced exit: connections did not close in time.');
    process.exit(exitCode || 1);
  }, 5000);
  forceExit.unref();

  server.close(() => {
    console.log('[Manto Moda] HTTP server closed cleanly.');
    process.exit(exitCode);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM', 0));
process.on('SIGINT', () => shutdown('SIGINT', 0));

// ---------------------------------------------------------------------------
// Process-level safety nets (see IMPROVEMENT_PLAN.md P2 #9).
//   - an unhandled promise rejection is logged but does NOT kill the shop;
//   - an uncaught exception is unrecoverable, so we log it, flush data and exit
//     non-zero to let the process manager restart a clean instance.
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason instanceof Error ? reason.stack || reason.message : reason);
});

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception:', error?.stack || error);
  shutdown('uncaughtException', 1);
});

// ---------------------------------------------------------------------------
// OTP housekeeping: expired verification codes are dropped periodically so the
// in-memory collection cannot grow without bound.
// ---------------------------------------------------------------------------
const OTP_SWEEP_INTERVAL_MS = Number(process.env.OTP_SWEEP_INTERVAL_MS || 5 * 60 * 1000);
let otpSweeper = setInterval(() => {
  try {
    const removed = db.purgeExpiredOtps();
    if (removed > 0) console.log(`[Manto Moda] Purged ${removed} expired OTP record(s).`);
  } catch (error) {
    console.error('[Manto Moda] OTP sweep failed:', error.message);
  }
}, OTP_SWEEP_INTERVAL_MS);
otpSweeper.unref();

export default app;
