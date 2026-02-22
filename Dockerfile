FROM node:20-alpine

# better-sqlite3 needs build tools for native compilation
RUN apk add --no-cache python3 make g++

# Security: run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Remove build tools after native module compilation
RUN apk del python3 make g++

# Copy application files
COPY src/ ./src/
COPY public/ ./public/
COPY prices.json ./
COPY price-checker.js ./

# Create data directory for SQLite (writable by app)
RUN mkdir -p /app/data && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose application and health check ports
EXPOSE 3000 9090

# Health check against dedicated health server
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9090/health || exit 1

# Start server
CMD ["node", "src/server.js"]
