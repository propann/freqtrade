FROM oven/bun:1.4-alpine AS dependencies
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
COPY --from=builder --chown=node:node /app/console/.next/standalone ./
COPY --from=builder --chown=node:node /app/console/.next/static ./console/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(response=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "console/server.js"]
