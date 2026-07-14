export { Prisma, PrismaClient, DeliveryStatus } from '@prisma/client';
export type {
  User,
  Project,
  ApiKey,
  WebhookEndpoint,
  Event,
  Delivery,
  DeliveryAttempt,
} from '@prisma/client';

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
