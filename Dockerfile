FROM node:22-alpine AS dependencies

WORKDIR /app
RUN corepack enable
RUN apk add --no-cache poppler-utils

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Small utility image for one-off seed/sync/embed scripts. It keeps the same
# lockfile as the app but does not need a Next.js production build.
FROM dependencies AS tools

COPY . .
CMD ["./node_modules/.bin/tsx", "scripts/seed-supabase.ts"]

FROM dependencies AS builder

COPY . .
RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# PDF ingestion shells out to pdftotext at request time.
RUN apk add --no-cache poppler-utils \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

USER nextjs
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]
