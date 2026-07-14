FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN corepack pnpm install --frozen-lockfile \
  && corepack pnpm --filter @hookrelay/shared build \
  && corepack pnpm --filter @hookrelay/database generate \
  && corepack pnpm --filter @hookrelay/database build \
  && corepack pnpm --filter @hookrelay/api build
EXPOSE 3001
CMD ["corepack", "pnpm", "--filter", "@hookrelay/api", "start"]

