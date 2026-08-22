FROM oven/bun:1.2-alpine AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY console/package.json ./console/package.json
RUN bun install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/console/node_modules ./console/node_modules
COPY package.json bun.lock ./
COPY console ./console
RUN npm run build --workspace=console

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/console/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/console/.next/static ./console/.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "console/server.js"]
