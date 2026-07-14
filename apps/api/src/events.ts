import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiProperty,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DeliveryStatus, Prisma } from '@hookrelay/database';
import { verifyApiKey } from '@hookrelay/shared';
import { IsObject, IsString, Length } from 'class-validator';
import { AuthGuard, CurrentUserId } from './auth';
import { config } from './config';
import { DeliveryQueue } from './queue.service';
import { PrismaService } from './prisma.service';
import { ProjectsService } from './projects';

export class PublishEventDto {
  @ApiProperty({ example: 'order.created' })
  @IsString()
  @Length(1, 120)
  type!: string;
  @ApiProperty({
    example: { orderId: 'order_123', amount: 19900 },
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  payload!: Record<string, unknown>;
}

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: DeliveryQueue,
  ) {}

  private async authenticate(key: string) {
    const candidates = await this.prisma.apiKey.findMany({
      where: { keyPrefix: key.slice(0, 11), revokedAt: null },
      include: { project: true },
    });
    const apiKey = candidates.find((candidate) =>
      verifyApiKey(key, candidate.keyHash, config().API_KEY_PEPPER),
    );
    if (!apiKey)
      throw new HttpException('Invalid API key', HttpStatus.UNAUTHORIZED);
    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });
    return apiKey.project;
  }

  async publish(key: string, idempotencyKey: string, dto: PublishEventDto) {
    const project = await this.authenticate(key);
    let event;
    try {
      event = await this.prisma.$transaction(async (tx) => {
        const created = await tx.event.create({
          data: {
            projectId: project.id,
            type: dto.type,
            payload: dto.payload as Prisma.InputJsonObject,
            idempotencyKey,
          },
        });
        const endpoints = await tx.webhookEndpoint.findMany({
          where: { projectId: project.id, isActive: true },
          select: { id: true },
        });
        await tx.delivery.createMany({
          data: endpoints.map((endpoint) => ({
            eventId: created.id,
            endpointId: endpoint.id,
          })),
        });
        return tx.event.findUniqueOrThrow({
          where: { id: created.id },
          include: { deliveries: true },
        });
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      event = await this.prisma.event.findUniqueOrThrow({
        where: {
          projectId_idempotencyKey: { projectId: project.id, idempotencyKey },
        },
        include: { deliveries: true },
      });
    }
    try {
      await Promise.all(
        event.deliveries
          .filter((delivery) => delivery.status === DeliveryStatus.PENDING)
          .map((delivery) => this.queue.enqueue(delivery.id)),
      );
    } catch {
      throw new HttpException(
        'Event stored, but delivery queue is unavailable; retry with the same idempotency key',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return {
      eventId: event.id,
      deliveryCount: event.deliveries.length,
      idempotent: event.createdAt.getTime() < Date.now() - 1000,
    };
  }
}

@ApiTags('Event ingestion')
@Controller('events')
export class EventIngestionController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @HttpCode(202)
  @ApiSecurity('api-key')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({
    summary: 'Publish an idempotent event using a project API key',
  })
  @ApiBadRequestResponse({ description: 'Headers or event body are invalid' })
  @ApiUnauthorizedResponse({
    description: 'The API key is missing, revoked, or invalid',
  })
  publish(
    @Headers('x-api-key') key: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: PublishEventDto,
  ) {
    if (!key)
      throw new HttpException('X-API-Key is required', HttpStatus.UNAUTHORIZED);
    if (!idempotencyKey || idempotencyKey.length > 200)
      throw new HttpException(
        'Idempotency-Key is required and must be at most 200 characters',
        HttpStatus.BAD_REQUEST,
      );
    return this.events.publish(key, idempotencyKey, dto);
  }
}

@ApiTags('Events and deliveries')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller()
export class HistoryController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly queue: DeliveryQueue,
  ) {}

  @Get('projects/:projectId/events')
  @ApiOperation({ summary: 'List recent project events' })
  async events(
    @CurrentUserId() userId: string,
    @Param('projectId') projectId: string,
  ) {
    await this.projects.requireOwned(userId, projectId);
    return this.projects.prisma.event.findMany({
      where: { projectId },
      include: { _count: { select: { deliveries: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Get('projects/:projectId/events/:eventId')
  @ApiOperation({ summary: 'Get an event and its deliveries' })
  async event(
    @CurrentUserId() userId: string,
    @Param('projectId') projectId: string,
    @Param('eventId') eventId: string,
    @Query('status') status?: DeliveryStatus,
  ) {
    await this.projects.requireOwned(userId, projectId);
    const event = await this.projects.prisma.event.findFirst({
      where: { id: eventId, projectId },
      include: {
        deliveries: {
          where: status ? { status } : {},
          include: {
            endpoint: { select: { id: true, name: true, url: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  @Get('deliveries/:deliveryId')
  @ApiOperation({ summary: 'Get delivery details and full attempt history' })
  async delivery(
    @CurrentUserId() userId: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    const delivery = await this.projects.prisma.delivery.findFirst({
      where: { id: deliveryId, event: { project: { userId } } },
      include: {
        attempts: { orderBy: { attemptNumber: 'asc' } },
        endpoint: { select: { id: true, name: true, url: true } },
        event: true,
      },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  @Post('deliveries/:deliveryId/replay')
  @ApiOperation({
    summary: 'Replay a failed delivery while preserving prior attempts',
  })
  async replay(
    @CurrentUserId() userId: string,
    @Param('deliveryId') deliveryId: string,
  ) {
    const owned = await this.projects.prisma.delivery.findFirst({
      where: { id: deliveryId, event: { project: { userId } } },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Delivery not found');
    const claimed = await this.projects.prisma.delivery.updateMany({
      where: { id: deliveryId, status: DeliveryStatus.FAILED },
      data: {
        status: DeliveryStatus.PENDING,
        nextAttemptAt: null,
        lastError: null,
      },
    });
    if (!claimed.count)
      throw new HttpException(
        'Only failed deliveries can be replayed',
        HttpStatus.CONFLICT,
      );
    try {
      await this.queue.enqueue(deliveryId);
      return { success: true, deliveryId };
    } catch {
      await this.projects.prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          status: DeliveryStatus.FAILED,
          lastError: 'Replay could not be queued',
        },
      });
      throw new HttpException(
        'Delivery queue is unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
