FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY . .
RUN corepack pnpm install --frozen-lockfile \
  && corepack pnpm --filter @hookrelay/shared build \
  && corepack pnpm --filter @hookrelay/database generate \
  && corepack pnpm --filter @hookrelay/database build \
  && corepack pnpm --filter @hookrelay/worker build
CMD ["corepack", "pnpm", "--filter", "@hookrelay/worker", "start"]
