import { DeliveryStatus } from '@hookrelay/database';
import { describe, expect, it, vi } from 'vitest';
import { DeliveryProcessor } from './delivery.processor';

function fixture() {
  return {
    id: 'delivery-1',
    attemptCount: 0,
    endpoint: {
      url: 'https://example.test/webhook',
      secret: 'secret',
      isActive: true,
    },
    event: {
      id: 'event-1',
      type: 'order.created',
      createdAt: new Date('2026-01-01T12:00:00Z'),
      payload: { orderId: '1' },
    },
  };
}

function database(delivery = fixture()) {
  const tx = {
    deliveryAttempt: { create: vi.fn() },
    delivery: { update: vi.fn() },
  };
  return {
    tx,
    prisma: {
      delivery: {
        findUnique: vi.fn().mockResolvedValue(delivery),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    },
  };
}

describe('DeliveryProcessor', () => {
  it('signs and records a successful delivery', async () => {
    const db = database();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('accepted', { status: 202 }));
    const processor = new DeliveryProcessor(db.prisma, fetchMock);
    await expect(
      processor.process({
        data: { deliveryId: 'delivery-1' },
        attemptsMade: 0,
        opts: { attempts: 4 },
      }),
    ).resolves.toEqual({ delivered: true });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({
      'Webhook-Id': 'event-1',
      'User-Agent': 'HookRelay',
    });
    expect(db.tx.delivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DeliveryStatus.DELIVERED,
          attemptCount: 1,
        }),
      }),
    );
  });

  it('persists a failed attempt and schedules retry', async () => {
    const db = database();
    const processor = new DeliveryProcessor(
      db.prisma,
      vi.fn().mockResolvedValue(new Response('no', { status: 503 })),
    );
    await expect(
      processor.process({
        data: { deliveryId: 'delivery-1' },
        attemptsMade: 0,
        opts: { attempts: 4 },
      }),
    ).rejects.toThrow('HTTP 503');
    expect(db.tx.deliveryAttempt.create).toHaveBeenCalledOnce();
    expect(db.tx.delivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: DeliveryStatus.RETRYING }),
      }),
    );
  });

  it('marks the delivery failed after the final attempt', async () => {
    const db = database({ ...fixture(), attemptCount: 3 });
    const processor = new DeliveryProcessor(
      db.prisma,
      vi.fn().mockRejectedValue(new Error('timeout')),
    );
    await expect(
      processor.process({
        data: { deliveryId: 'delivery-1' },
        attemptsMade: 3,
        opts: { attempts: 4 },
      }),
    ).rejects.toThrow('timeout');
    expect(db.tx.delivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DeliveryStatus.FAILED,
          attemptCount: 4,
        }),
      }),
    );
  });
});
