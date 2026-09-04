# Production Multi-Stage Dockerfile for Manto Moda
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy package descriptors & install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY src ./src
COPY tests ./tests

# Expose port
EXPOSE 3000

# Non-root secure user
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start server
CMD ["node", "src/server/index.js"]
