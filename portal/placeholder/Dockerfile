FROM node:20-alpine

WORKDIR /app

COPY portal/placeholder/package.json portal/placeholder/package-lock.json ./
RUN npm ci --only=production

COPY portal/placeholder/src ./src
COPY portal/placeholder/public ./public
COPY portal/placeholder/db.sql ./db.sql
COPY templates/client-compose.yml ./templates/client-compose.yml

USER node
EXPOSE 8080

CMD ["node", "src/server.js"]
