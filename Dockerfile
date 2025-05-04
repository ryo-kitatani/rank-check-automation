# ビルドステージ
FROM --platform=linux/amd64 node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# 実行ステージ
FROM --platform=linux/amd64 node:20-slim
# Debian ベースのイメージなので apt-get を使用
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  fonts-ipafont \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# ビルドステージから必要なファイルだけコピー
COPY --from=builder /app/node_modules ./node_modules
COPY . .
# downloadsディレクトリを作成し、適切な権限を設定
RUN mkdir -p /app/downloads && \
    chown -R node:node /app
# 設定と実行
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
  PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
USER node
CMD ["node", "index.js"]