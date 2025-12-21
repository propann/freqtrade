FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

COPY src ./src
COPY public ./public
COPY db.sql ./db.sql

USER node
EXPOSE 8080

CMD ["node", "src/server.js"]
