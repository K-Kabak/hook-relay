import { DeliveryStatus } from '@hookrelay/database';
import {
  DeliveryJob,
  isRetryableStatus,
  MAX_DELIVERY_ATTEMPTS,
  retryDelay,
  signWebhook,
  truncateResponseBody,
  WebhookEnvelope,
} from '@hookrelay/shared';
import { Job, UnrecoverableError } from 'bullmq';

type PrismaLike = any;
type FetchLike = typeof fetch;

export class DeliveryProcessor {
  constructor(
    private readonly prisma: PrismaLike,
    private readonly fetchFn: FetchLike = fetch,
    private readonly timeoutMs = Number(process.env.WEBHOOK_TIMEOUT_MS ?? 5000),
  ) {}

  async process(job: Pick<Job<DeliveryJob>, 'data' | 'attemptsMade' | 'opts'>) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: job.data.deliveryId },
      include: { event: true, endpoint: true },
    });
    if (!delivery) throw new UnrecoverableError('Delivery not found');
    if (!delivery.endpoint.isActive) {
      await this.prisma.delivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.FAILED, lastError: 'Endpoint is disabled' } });
      throw new UnrecoverableError('Endpoint is disabled');
    }

    await this.prisma.delivery.update({ where: { id: delivery.id }, data: { status: DeliveryStatus.PROCESSING, nextAttemptAt: null } });
    const attemptNumber = delivery.attemptCount + 1;
    const envelope: WebhookEnvelope = {
      id: delivery.event.id,
      type: delivery.event.type,
      createdAt: delivery.event.createdAt.toISOString(),
      data: delivery.event.payload as Record<string, unknown>,
    };
    const rawBody = JSON.stringify(envelope);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const started = Date.now();
    let statusCode: number | null = null;
    let responseBody: string | null = null;
    let errorMessage: string | null = null;

    try {
      const response = await this.fetchFn(delivery.endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'HookRelay',
          'Webhook-Id': delivery.event.id,
          'Webhook-Timestamp': timestamp,
          'Webhook-Signature': signWebhook(delivery.event.id, timestamp, rawBody, delivery.endpoint.secret),
        },
        body: rawBody,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      statusCode = response.status;
      responseBody = truncateResponseBody(await response.text());
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Unknown connection error';
    }

    const durationMs = Date.now() - started;
    const success = statusCode !== null && statusCode >= 200 && statusCode < 300;
    const retryable = statusCode === null || isRetryableStatus(statusCode);
    const maxAttempts = Number(job.opts.attempts ?? MAX_DELIVERY_ATTEMPTS);
    const hasAttemptsLeft = job.attemptsMade + 1 < maxAttempts;
    const finalStatus = success ? DeliveryStatus.DELIVERED : retryable && hasAttemptsLeft ? DeliveryStatus.RETRYING : DeliveryStatus.FAILED;
    const nextAttemptAt = finalStatus === DeliveryStatus.RETRYING ? new Date(Date.now() + retryDelay(job.attemptsMade + 1)) : null;

    await this.prisma.$transaction(async (tx: PrismaLike) => {
      await tx.deliveryAttempt.create({
        data: { deliveryId: delivery.id, attemptNumber, statusCode, responseBody, error: errorMessage, durationMs },
      });
      await tx.delivery.update({
        where: { id: delivery.id },
        data: {
          status: finalStatus,
          attemptCount: attemptNumber,
          nextAttemptAt,
          lastStatusCode: statusCode,
          lastResponseBody: responseBody,
          lastError: errorMessage ?? (success ? null : `HTTP ${statusCode}`),
          deliveredAt: success ? new Date() : null,
        },
      });
    });

    if (success) return { delivered: true };
    const message = errorMessage ?? `HTTP ${statusCode}`;
    if (!retryable) throw new UnrecoverableError(message);
    throw new Error(message);
  }
}

