FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY apps/api apps/api
RUN npm run build --workspace @inventory/api

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN apk add --no-cache fontconfig ttf-dejavu \
  && npm ci --omit=dev \
  && npm cache clean --force

COPY --from=build /app/apps/api/dist apps/api/dist
RUN mkdir -p /app/uploads/products && chown -R node:node /app/uploads

USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
