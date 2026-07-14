# HookRelay

HookRelay is a self-hosted webhook delivery dashboard. It accepts idempotent events over a REST API, fans them out to project endpoints through BullMQ, signs every request, retries transient failures, and keeps an inspectable attempt history.

![HookRelay project dashboard](docs/dashboard.png)

## Features

- Cookie-based registration and login with project-level ownership checks
- One-time API key and webhook secret disclosure
- Idempotent event ingestion backed by a PostgreSQL unique constraint
- Asynchronous BullMQ delivery with HMAC SHA-256 signatures
- Four-attempt retry schedule and terminal HTTP classification
- Delivery response, error, duration, and attempt history
- Safe manual replay of failed deliveries
- Project statistics, recent events, and recent failures
- Swagger/OpenAPI, a local failure receiver, focused tests, Docker Compose, and CI

## Architecture

```mermaid
flowchart LR
  Client --> API[NestJS API]
  Dashboard[Next.js dashboard] --> API
  API --> PostgreSQL
  API --> Queue[BullMQ / Redis]
  Queue --> Worker
  Worker --> PostgreSQL
  Worker --> Endpoint[Webhook endpoint]
```

The API commits events and deliveries to PostgreSQL before enqueueing deterministic jobs. If Redis is unavailable, the request returns `503`; repeating it with the same idempotency key finds the existing event and reconciles its pending deliveries. PostgreSQL remains the source of truth without adding an outbox service to the MVP.

## Stack

- Next.js 16, React 19, Tailwind CSS, TanStack Query, React Hook Form, Zod
- NestJS 11, Swagger, JWT, Argon2id
- PostgreSQL 18, Prisma ORM 6
- Redis 8, BullMQ 5
- TypeScript, pnpm, Vitest, Docker Compose, GitHub Actions

## Quick start with Docker

Requirements: Docker Desktop/Engine with Compose and ports `3000`, `3001`, `5432`, and `6379` available.

```bash
docker compose up --build -d
docker compose exec api corepack pnpm --filter @hookrelay/database seed
```

Open:

- Dashboard: http://localhost:3000
- Swagger UI: http://localhost:3001/docs
- API health: http://localhost:3001/health

The seed creates `demo@hookrelay.local` with password `demo-password`, a project, an endpoint, and a pending sample delivery. Generate an API key in the dashboard before publishing an event.

Stop the stack with `docker compose down`. Add `-v` only when you intentionally want to erase local PostgreSQL and Redis volumes.

## Local development

Requirements: Node.js 24 LTS, Corepack, PostgreSQL, and Redis.

```bash
corepack prepare pnpm@11.13.0 --activate
corepack pnpm install
cp .env.example .env
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm dev
```

On PowerShell, replace `cp .env.example .env` with `Copy-Item .env.example .env`. Workspace applications use the root environment; load `.env` in your shell or use Compose for the shortest setup.

### Environment

| Variable              | Purpose                                    | Example                                                                   |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection                      | `postgresql://hookrelay:hookrelay@localhost:5432/hookrelay?schema=public` |
| `REDIS_URL`           | BullMQ Redis connection                    | `redis://localhost:6379`                                                  |
| `JWT_SECRET`          | JWT signing secret, at least 32 characters | generate a random value                                                   |
| `JWT_EXPIRES_IN`      | Session JWT lifetime                       | `8h`                                                                      |
| `API_KEY_PEPPER`      | Server-side API key hashing pepper         | generate a different random value                                         |
| `WEB_ORIGIN`          | Allowed credentialed browser origin        | `http://localhost:3000`                                                   |
| `API_PORT`            | NestJS listen port                         | `3001`                                                                    |
| `NEXT_PUBLIC_API_URL` | Browser-visible API base URL               | `http://localhost:3001/api/v1`                                            |
| `WEBHOOK_TIMEOUT_MS`  | Per-attempt HTTP timeout                   | `5000`                                                                    |

Never commit a real `.env`. Docker Compose defaults are explicitly local-only.

## Publish an event

Create a project key in **API keys**, then run:

```bash
curl -X POST http://localhost:3001/api/v1/events \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $HOOKRELAY_API_KEY" \
  -H "Idempotency-Key: order-123-created" \
  -d '{"type":"order.created","payload":{"orderId":"order_123","amount":19900}}'
```

Repeating the request with the same API key and `Idempotency-Key` returns the original event and cannot create duplicate database records.

## Webhook signatures

The worker sends the exact JSON body:

```json
{
  "id": "event_identifier",
  "type": "order.created",
  "createdAt": "2026-01-01T12:00:00.000Z",
  "data": { "orderId": "order_123", "amount": 19900 }
}
```

It signs `Webhook-Id.Webhook-Timestamp.Raw-Request-Body` and sends `Webhook-Signature: v1=<hex digest>`. Verification must use the raw bytes received, not re-serialized JSON:

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyHookRelay(
  id: string,
  timestamp: string,
  rawBody: string,
  secret: string,
  signature: string,
) {
  const expected = `v1=${createHmac('sha256', secret)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('hex')}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}
```

Production receivers should additionally reject timestamps outside a small tolerance window to reduce replay risk.

## Delivery and retry behavior

| Result                      | Behavior                  |
| --------------------------- | ------------------------- |
| HTTP 2xx                    | Mark `DELIVERED`          |
| Connection error or timeout | Retry                     |
| HTTP 408, 429, or 5xx       | Retry                     |
| Other HTTP 4xx              | Mark `FAILED` immediately |

There are at most four attempts: immediately, then after approximately 30 seconds, 2 minutes, and 10 minutes. Each attempt is retained in PostgreSQL. Manual replay is available only for `FAILED` deliveries, preserves prior history, and atomically prevents duplicate active replay jobs.

For local testing, endpoints can target:

- `http://localhost:3001/dev/receiver/200`
- `http://localhost:3001/dev/receiver/500`
- `http://localhost:3001/dev/receiver/timeout`

From inside Compose, use the `api` hostname instead of `localhost`. These routes are unavailable when the API runs with `NODE_ENV=production`.

## Commands

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm --filter @hookrelay/database validate
```

Tests focus on signatures, API key hashing, retry classification/delays, authentication, ownership, event idempotency, delivery history/replay, and worker success/failure transitions. CI runs installation, Prisma generation, lint, typecheck, all tests, and all application builds on pushes and pull requests.

## API documentation

Swagger UI is served at http://localhost:3001/docs. The main ingestion endpoint uses `X-API-Key`; dashboard endpoints use the `hookrelay_session` HttpOnly cookie. All dashboard resource lookups verify project ownership and intentionally return `404` for another user's resources.

## Known limitations

- Endpoint URLs have basic validation only. There is no production-grade SSRF protection.
- Webhook signing secrets are required by the worker and are not encrypted at rest.
- The database-to-Redis boundary uses idempotent reconciliation rather than a transactional outbox.
- Sessions use one short-lived JWT without refresh rotation or multi-session management.
- Response bodies are truncated to 4 KiB; there is no long-term retention policy.
- The local receiver is for development only.
- Docker Compose and example credentials are not production infrastructure.

## Future roadmap

- Organizations, roles, invitations, and multi-tenancy
- Refresh token rotation and multiple user sessions
- Full SSRF protection and webhook secret rotation/encryption
- Dead-letter queue, circuit breaker, and `Retry-After` support
- Per-project and per-endpoint rate limits
- OpenTelemetry, Prometheus, and Grafana
- Testcontainers, contract tests, and k6 performance tests
- Distributed locking, multiple worker instances, retention, and archival
- Production deployment, billing, and SaaS plans

## License

[MIT](LICENSE)
