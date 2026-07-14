export const DELIVERY_QUEUE = 'webhook-deliveries';
export const MAX_DELIVERY_ATTEMPTS = 4;
export const RETRY_DELAYS_MS = [30_000, 120_000, 600_000] as const;
export const RESPONSE_BODY_LIMIT = 4096;

export type DeliveryJob = { deliveryId: string };

export function retryDelay(attemptsMade: number): number {
  return RETRY_DELAYS_MS[Math.max(0, Math.min(attemptsMade - 1, 2))] ?? 0;
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function truncateResponseBody(body: string): string {
  return body.slice(0, RESPONSE_BODY_LIMIT);
}

