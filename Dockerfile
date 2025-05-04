# ビルドステージ
FROM node:23-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# 実行ステージ
FROM node:23-slim
RUN apk add --no-cache chromium ttf-liberation font-ipa
WORKDIR /app
# ビルドステージから必要なファイルだけコピー
COPY --from=builder /app/node_modules ./node_modules
COPY . .
# 設定と実行
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
  PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
USER node
CMD ["node", "index.js"]