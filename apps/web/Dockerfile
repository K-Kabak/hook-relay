FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY . .
RUN corepack pnpm install --frozen-lockfile \
  && corepack pnpm --filter @hookrelay/web build
EXPOSE 3000
CMD ["corepack", "pnpm", "--filter", "@hookrelay/web", "start"]

