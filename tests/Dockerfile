# syntax=docker/dockerfile:1
FROM node:20-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        wget \
        xvfb \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libc6 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libexpat1 \
        libfontconfig1 \
        libgbm1 \
        libgcc1 \
        libglib2.0-0 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libstdc++6 \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxcomposite1 \
        libxcursor1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxi6 \
        libxrandr2 \
        libxrender1 \
        libxss1 \
        libxtst6 \
        locales \
        unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

RUN npx playwright install --with-deps --no-root || npx playwright install --with-deps

COPY testsprite.config.js ./testsprite.config.js
COPY ./configs ./configs
COPY ./e2e_guest ./tests/e2e_guest
COPY ./e2e_staff ./tests/e2e_staff
COPY ./e2e_organizer ./tests/e2e_organizer
COPY ./scripts ./tests/scripts

ENV CI=1 \
    HEADLESS=1

ENTRYPOINT ["npm", "run", "test:e2e:all"]
