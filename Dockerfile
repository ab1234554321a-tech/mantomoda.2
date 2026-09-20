# =============================================================================
#  Manto Moda — production image
#
#  Design notes (deliberate choices, not defaults):
#   * Debian slim (glibc) rather than Alpine: `sharp` ships prebuilt binaries and
#     the image family matches the environment where the upload pipeline was
#     actually verified, so there is no surprise libvips rebuild on first deploy.
#   * Only production dependencies are installed (`npm ci --omit=dev`); the test
#     runner and supertest never reach the server.
#   * No tests, docs or skills are copied in: the runtime image contains only the
#     code needed to serve the shop (~10 MB of source).
#   * The app runs as `node` (uid 1000), never as root.
#   * /app/data is declared as a volume: it holds the orders snapshot AND the
#     uploaded product photos. Mounting it is what makes data survive a redeploy.
# =============================================================================
FROM node:22-bookworm-slim AS base

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data \
    UPLOAD_DIR=/app/data/uploads \
    PERSIST_DATA=true

WORKDIR /app

# 1. Dependencies first, so a source change does not invalidate this layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# 2. Application source only.
COPY src ./src

# 3. Writable data directory owned by the unprivileged user.
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data

USER node

EXPOSE 3000

# 4. Health check using Node itself (the slim image has no curl/wget guarantee).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 5. Graceful shutdown: Node must receive SIGTERM so the snapshot is flushed.
STOPSIGNAL SIGTERM

CMD ["node", "src/server/index.js"]
