FROM node:20-bookworm AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY web/package.json web/package-lock.json ./web/

RUN npm ci
RUN rm -rf web/node_modules

COPY tsconfig.json ./
COPY src ./src

RUN npm run build:backend
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    libarchive-tools \
    p7zip-full \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data /var/www/html/ipxe /var/www/html/os-files

EXPOSE 3000

CMD ["node", "dist/index.js"]
