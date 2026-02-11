# ─── SUBCULT-CORP — Multi-stage Next.js Dockerfile ───
FROM node:22-alpine AS base

# ── Install dependencies ──
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# ── Build the application ──
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects anonymous telemetry — disable in CI/prod
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Production image ──
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy only what's needed to run
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy worker scripts + workspace data + migrations (needed at runtime)
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/workspace ./workspace
COPY --from=builder /app/db ./db

# Workers need full node_modules (they import postgres, @openrouter/sdk, dotenv directly)
COPY --from=deps /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
