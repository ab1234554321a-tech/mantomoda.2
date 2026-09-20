// =============================================================================
//  Admin audit trail (ADR-020)
//
//  Any change an admin makes to money, stock or order state is recorded: who,
//  when, what, from which IP. This is what turns "the price looks wrong" into an
//  answerable question, and it is also the evidence trail if a staff account is
//  ever misused.
//
//  Attached after the response finishes, so the log reflects what actually
//  happened (status code included) and never slows the request down.
// =============================================================================
import { db } from '../db/store.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Human-readable entity extraction from the URL path. */
function describeRequest(req) {
  const segments = req.path.split('/').filter(Boolean);
  const [resource, ...rest] = segments;
  const readable = rest.filter(s => !/^\d+$/.test(s));

  // Only a real identifier belongs in entityId; sub-resources such as
  // `inventory/bulk` are already captured by the action string.
  const looksLikeId = rest.find(segment => /^(prod|ord|cpn|var|user|app|usr|MM)[-_]/i.test(segment));

  return {
    entity: resource || 'admin',
    entityId: looksLikeId || null,
    action: `${req.method} ${resource || ''}${readable.length ? `/${readable.join('/')}` : ''}`.trim()
  };
}

/** Fields that must never be written into the log. */
const REDACTED_KEYS = ['password', 'token', 'apiKey', 'authorization', 'secret'];

function safeDetails(body) {
  if (!body || typeof body !== 'object') return null;
  const details = {};
  for (const [key, value] of Object.entries(body)) {
    if (REDACTED_KEYS.some(r => key.toLowerCase().includes(r.toLowerCase()))) continue;
    if (value && typeof value === 'object') {
      details[key] = Array.isArray(value) ? `[${value.length} item(s)]` : '[object]';
    } else {
      details[key] = String(value).slice(0, 200);
    }
  }
  return Object.keys(details).length ? details : null;
}

export function auditAdminWrite(req, res, next) {
  if (!MUTATING.has(req.method)) return next();

  res.on('finish', () => {
    // Only successful changes are worth recording; a rejected request changed nothing.
    if (res.statusCode >= 400) return;

    try {
      const { entity, entityId, action } = describeRequest(req);
      db.recordAdminAction({
        adminId: req.user?.id,
        adminEmail: req.user?.email,
        action,
        entity,
        entityId,
        details: safeDetails(req.body),
        ip: req.ip
      });
    } catch (error) {
      console.error('[AdminAudit] failed to record action:', error.message);
    }
  });

  next();
}

export default auditAdminWrite;
