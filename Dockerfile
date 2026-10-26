FROM node:22.23.3-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --include=dev
COPY . .
RUN npm run build

FROM node:22.23.3-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production DATA_PROVIDER=oracle API_HOST=0.0.0.0
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --omit=dev
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/apps/api/src/server.js"]
