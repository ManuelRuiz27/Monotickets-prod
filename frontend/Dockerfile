FROM node:20-alpine
WORKDIR /app

COPY server.js ./
COPY package.json ./
COPY scripts ./scripts

ENV FRONTEND_PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
