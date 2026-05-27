FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY --from=build /app/dist ./dist
# Signed content bundle (manifest.json + per-domain JSON + signature +
# public key). KnowledgeService.loadFromConfig() reads CONTENT_BUNDLE_DIR
# at boot and refuses to start if the manifest is missing.
COPY content ./content
EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]
