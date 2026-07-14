import { DeliveryStatus, Prisma } from '@hookrelay/database';
import { hashApiKey } from '@hookrelay/shared';
import {
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth';
import { EventsService, HistoryController } from './events';
import { ProjectsService } from './projects';

beforeAll(() => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.REDIS_URL = 'redis://localhost:6379';
  process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters';
  process.env.API_KEY_PEPPER = 'test-api-pepper-with-at-least-32-characters';
});

describe('authentication API', () => {
  it('registers and logs in a user without exposing the password hash', async () => {
    const passwordHash = await argon2.hash('password123');
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
          id: 'user-1',
          email: 'alice@example.com',
          name: 'Alice',
          passwordHash,
        }),
        create: vi.fn().mockResolvedValue({
          id: 'user-1',
          email: 'alice@example.com',
          name: 'Alice',
          passwordHash,
        }),
      },
    };
    const jwt = { signAsync: vi.fn().mockResolvedValue('signed-jwt') };
    const response = { cookie: vi.fn() };
    const controller = new AuthController(prisma as any, jwt as any);
    await expect(
      controller.register(
        { email: 'ALICE@example.com', name: 'Alice', password: 'password123' },
        response as any,
      ),
    ).resolves.toEqual({
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
    });
    await expect(
      controller.login(
        { email: 'alice@example.com', password: 'password123' },
        response as any,
      ),
    ).resolves.toEqual({
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
    });
    expect(response.cookie).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate registration', async () => {
    const controller = new AuthController(
      {
        user: { findUnique: vi.fn().mockResolvedValue({ id: 'existing' }) },
      } as any,
      {} as any,
    );
    await expect(
      controller.register(
        { email: 'a@example.com', name: 'Alice', password: 'password123' },
        {} as any,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('resource ownership', () => {
  it('does not reveal another user project', async () => {
    const projects = new ProjectsService({
      project: { findFirst: vi.fn().mockResolvedValue(null) },
    } as any);
    await expect(
      projects.requireOwned('user-a', 'project-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('event publishing API', () => {
  it('returns the existing event for the same idempotency key and requeues pending deliveries', async () => {
    const key = 'hr_a-real-test-key';
    const delivery = { id: 'delivery-1', status: DeliveryStatus.PENDING };
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '6.19.3',
    });
    const prisma = {
      apiKey: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'key-1',
            keyPrefix: key.slice(0, 11),
            keyHash: hashApiKey(key, process.env.API_KEY_PEPPER!),
            project: { id: 'project-1' },
          },
        ]),
        update: vi.fn(),
      },
      $transaction: vi.fn().mockRejectedValue(duplicate),
      event: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'event-1',
          createdAt: new Date(),
          deliveries: [delivery],
        }),
      },
    };
    const queue = { enqueue: vi.fn() };
    const service = new EventsService(prisma as any, queue as any);
    await expect(
      service.publish(key, 'same-key', {
        type: 'order.created',
        payload: { id: 1 },
      }),
    ).resolves.toMatchObject({ eventId: 'event-1', deliveryCount: 1 });
    expect(queue.enqueue).toHaveBeenCalledWith('delivery-1');
  });
});

describe('delivery history and replay API', () => {
  it('returns delivery history owned by the current user', async () => {
    const delivery = { id: 'delivery-1', attempts: [{ attemptNumber: 1 }] };
    const prisma = {
      delivery: { findFirst: vi.fn().mockResolvedValue(delivery) },
    };
    const controller = new HistoryController({ prisma } as any, {} as any);
    await expect(controller.delivery('user-1', 'delivery-1')).resolves.toEqual(
      delivery,
    );
    expect(prisma.delivery.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          event: { project: { userId: 'user-1' } },
        }),
      }),
    );
  });

  it('allows one replay claim and rejects another active claim', async () => {
    const prisma = {
      delivery: {
        findFirst: vi.fn().mockResolvedValue({ id: 'delivery-1' }),
        updateMany: vi
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
        update: vi.fn(),
      },
    };
    const queue = { enqueue: vi.fn() };
    const controller = new HistoryController({ prisma } as any, queue as any);
    await expect(controller.replay('user-1', 'delivery-1')).resolves.toEqual({
      success: true,
      deliveryId: 'delivery-1',
    });
    await expect(
      controller.replay('user-1', 'delivery-1'),
    ).rejects.toBeInstanceOf(HttpException);
    expect(queue.enqueue).toHaveBeenCalledOnce();
  });
});
