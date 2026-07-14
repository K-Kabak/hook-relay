export const DELIVERY_QUEUE = 'webhook-deliveries';
export const MAX_DELIVERY_ATTEMPTS = 4;
export const RESPONSE_BODY_LIMIT = 4096;

export type DeliveryJob = { deliveryId: string };

export type WebhookEnvelope = {
  id: string;
  type: string;
  createdAt: string;
  data: Record<string, unknown>;
};

