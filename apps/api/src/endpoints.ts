import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Length,
} from 'class-validator';
import { randomBytes, randomUUID } from 'node:crypto';
import { AuthGuard, CurrentUserId } from './auth';
import { DeliveryQueue } from './queue.service';
import { ProjectsService } from './projects';

export class CreateEndpointDto {
  @IsString() @Length(2, 80) name!: string;
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  url!: string;
}

export class UpdateEndpointDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  url?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('Webhook endpoints')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('projects/:projectId/endpoints')
export class EndpointsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly queue: DeliveryQueue,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List webhook endpoints without secrets' })
  async list(
    @CurrentUserId() userId: string,
    @Param('projectId') projectId: string,
  ) {
    await this.projects.requireOwned(userId, projectId);
    return this.projects.prisma.webhookEndpoint.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        url: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Create an endpoint; its signing secret is returned once',
  })
  async create(
    @CurrentUserId() userId: string,
    @Param('projectId') projectId: string,
    @Body() dto: CreateEndpointDto,
  ) {
    await this.projects.requireOwned(userId, projectId);
    const secret = `whsec_${randomBytes(32).toString('base64url')}`;
    const endpoint = await this.projects.prisma.webhookEndpoint.create({
      data: { projectId, name: dto.name.trim(), url: dto.url, secret },
    });
    return {
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      isActive: endpoint.isActive,
      createdAt: endpoint.createdAt,
      secret,
    };
  }

  @Patch(':endpointId')
  @ApiOperation({ summary: 'Update or toggle a webhook endpoint' })
  async update(
    @CurrentUserId() userId: string,
    @Param('projectId') projectId: string,
    @Param('endpointId') endpointId: string,
    @Body() dto: UpdateEndpointDto,
  ) {
    await this.projects.requireOwned(userId, projectId);
    const result = await this.projects.prisma.webhookEndpoint.updateMany({
      where: { id: endpointId, projectId },
      data: { name: dto.name?.trim(), url: dto.url, isActive: dto.isActive },
    });
    if (!result.count) throw new NotFoundException('Endpoint not found');
    return this.projects.prisma.webhookEndpoint.findUniqueOrThrow({
      where: { id: endpointId },
      select: {
        id: true,
        name: true,
        url: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  @Post(':endpointId/test')
  @ApiOperation({ summary: 'Queue a test event for one endpoint' })
  async test(
    @CurrentUserId() userId: string,
    @Param('projectId') projectId: string,
    @Param('endpointId') endpointId: string,
  ) {
    await this.projects.requireOwned(userId, projectId);
    const endpoint = await this.projects.prisma.webhookEndpoint.findFirst({
      where: { id: endpointId, projectId },
    });
    if (!endpoint) throw new NotFoundException('Endpoint not found');
    const delivery = await this.projects.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          projectId,
          type: 'hookrelay.test',
          payload: { test: true },
          idempotencyKey: `test-${randomUUID()}`,
        },
      });
      return tx.delivery.create({ data: { eventId: event.id, endpointId } });
    });
    await this.queue.enqueue(delivery.id);
    return { eventId: delivery.eventId, deliveryId: delivery.id };
  }
}
