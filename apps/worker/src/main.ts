import { prisma } from '@hookrelay/database';
import { DELIVERY_QUEUE, DeliveryJob, retryDelay } from '@hookrelay/shared';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { DeliveryProcessor } from './delivery.processor';

const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
const processor = new DeliveryProcessor(prisma);
const worker = new Worker<DeliveryJob>(DELIVERY_QUEUE, (job) => processor.process(job), {
  connection: redis,
  concurrency: 5,
  settings: {
    backoffStrategy: (attemptsMade, type) => (type === 'hookrelay' ? retryDelay(attemptsMade) : -1),
  },
});

worker.on('completed', (job) => console.info(`Delivered ${job.data.deliveryId}`));
worker.on('failed', (job, error) => console.error(`Delivery ${job?.data.deliveryId ?? 'unknown'} failed: ${error.message}`));

async function shutdown() {
  await worker.close();
  await redis.quit();
  await prisma.$disconnect();
}

process.on('SIGINT', () => void shutdown().then(() => process.exit(0)));
process.on('SIGTERM', () => void shutdown().then(() => process.exit(0)));

