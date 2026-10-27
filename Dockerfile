# Stage 1: Build frontend and backend
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package manifests
COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
COPY shared/package.json shared/

RUN npm ci

# Copy source code (no .env files are copied, excluded by .dockerignore)
COPY shared/ shared/
COPY frontend/ frontend/
COPY backend/ backend/

# Build frontend and backend
RUN npm run build:all

# Prune dev dependencies
RUN npm prune --omit=dev

# Stage 2: Production runtime
FROM node:20-alpine AS runner

WORKDIR /app

# Environment variables
ENV NODE_ENV=production \
    PORT=4000 \
    DB_PATH=/app/data/ripple.db \
    STORAGE_PATH=/app/storage \
    TEMP_STORAGE_PATH=/app/storage/tmp \
    CORS_ORIGIN="" \
    TRUST_PROXY=""

# Create persistent directories and set ownership to node user
RUN mkdir -p /app/data /app/storage /app/storage/tmp && \
    chown -R node:node /app

# Copy production runtime files from builder
COPY --chown=node:node --from=builder /app/package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/shared ./shared
COPY --chown=node:node --from=builder /app/backend/package.json ./backend/
COPY --chown=node:node --from=builder /app/backend/dist ./backend/dist
COPY --chown=node:node --from=builder /app/backend/node_modules ./backend/node_modules
COPY --chown=node:node --from=builder /app/frontend/dist ./frontend/dist

# Volumes for persistent database and uploads
VOLUME ["/app/data", "/app/storage"]

# Run as non-root user
USER node

EXPOSE 4000

CMD ["node", "backend/dist/server.js"]
