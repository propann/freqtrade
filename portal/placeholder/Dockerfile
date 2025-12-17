FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY server.js ./

RUN npm install --no-audit --no-fund express@4 pg@8

USER node

EXPOSE 8080
CMD ["node", "server.js"]
