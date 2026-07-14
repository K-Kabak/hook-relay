import { createHmac, timingSafeEqual } from 'node:crypto';

export type WebhookEnvelope = {
  id: string;
  type: string;
  createdAt: string;
  data: Record<string, unknown>;
};

export function signaturePayload(id: string, timestamp: string, rawBody: string): string {
  return `${id}.${timestamp}.${rawBody}`;
}

export function signWebhook(id: string, timestamp: string, rawBody: string, secret: string): string {
  const digest = createHmac('sha256', secret)
    .update(signaturePayload(id, timestamp, rawBody))
    .digest('hex');
  return `v1=${digest}`;
}

export function verifyWebhookSignature(
  id: string,
  timestamp: string,
  rawBody: string,
  secret: string,
  signature: string,
): boolean {
  const expected = Buffer.from(signWebhook(id, timestamp, rawBody, secret));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

