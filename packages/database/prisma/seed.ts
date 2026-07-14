import argon2 from 'argon2';
import { DeliveryStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Demo seed is disabled in production');
  const passwordHash = await argon2.hash('demo-password');
  const user = await prisma.user.upsert({
    where: { email: 'demo@hookrelay.local' },
    update: { name: 'Demo User', passwordHash },
    create: { email: 'demo@hookrelay.local', name: 'Demo User', passwordHash },
  });
  const project = await prisma.project.upsert({
    where: { userId_slug: { userId: user.id, slug: 'demo-project' } },
    update: { name: 'Demo Project' },
    create: { userId: user.id, slug: 'demo-project', name: 'Demo Project' },
  });
  await prisma.webhookEndpoint.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: { projectId: project.id },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      projectId: project.id,
      name: 'Local success receiver',
      url: 'http://api:3001/dev/receiver/200',
      secret: 'demo-webhook-secret',
    },
  });
  const event = await prisma.event.upsert({
    where: {
      projectId_idempotencyKey: {
        projectId: project.id,
        idempotencyKey: 'demo-seed',
      },
    },
    update: {},
    create: {
      projectId: project.id,
      type: 'demo.seeded',
      payload: { ready: true },
      idempotencyKey: 'demo-seed',
    },
  });
  await prisma.delivery.upsert({
    where: {
      eventId_endpointId: {
        eventId: event.id,
        endpointId: '00000000-0000-4000-8000-000000000001',
      },
    },
    update: {},
    create: {
      eventId: event.id,
      endpointId: '00000000-0000-4000-8000-000000000001',
      status: DeliveryStatus.PENDING,
    },
  });
  console.log('Seeded demo@hookrelay.local / demo-password');
}

main().finally(() => prisma.$disconnect());
