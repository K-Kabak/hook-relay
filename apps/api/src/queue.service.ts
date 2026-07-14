import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { DELIVERY_QUEUE, DeliveryJob, MAX_DELIVERY_ATTEMPTS } from '@hookrelay/shared';
import { config } from './config';

@Injectable()
export class DeliveryQueue implements OnModuleDestroy {
  private readonly redis = new IORedis(config().REDIS_URL, { maxRetriesPerRequest: null });
  private readonly queue = new Queue<DeliveryJob, void, 'deliver'>(DELIVERY_QUEUE, { connection: this.redis });

  async enqueue(deliveryId: string) {
    await this.queue.add(
      'deliver',
      { deliveryId },
      {
        jobId: `delivery-${deliveryId}`,
        attempts: MAX_DELIVERY_ATTEMPTS,
        backoff: { type: 'hookrelay' },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.redis.quit();
  }
}
