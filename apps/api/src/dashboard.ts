import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeliveryStatus } from '@hookrelay/database';
import { AuthGuard, CurrentUserId } from './auth';
import { ProjectsService } from './projects';

@ApiTags('Dashboard')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('projects/:projectId/dashboard')
export class DashboardController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get project delivery statistics and recent activity',
  })
  async get(
    @CurrentUserId() userId: string,
    @Param('projectId') projectId: string,
  ) {
    await this.projects.requireOwned(userId, projectId);
    const [eventCount, deliveryCount, groups, recentEvents, recentFailures] =
      await Promise.all([
        this.projects.prisma.event.count({ where: { projectId } }),
        this.projects.prisma.delivery.count({
          where: { event: { projectId } },
        }),
        this.projects.prisma.delivery.groupBy({
          by: ['status'],
          where: { event: { projectId } },
          _count: true,
        }),
        this.projects.prisma.event.findMany({
          where: { projectId },
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: { _count: { select: { deliveries: true } } },
        }),
        this.projects.prisma.delivery.findMany({
          where: { event: { projectId }, status: DeliveryStatus.FAILED },
          orderBy: { updatedAt: 'desc' },
          take: 8,
          include: {
            event: { select: { id: true, type: true } },
            endpoint: { select: { name: true } },
          },
        }),
      ]);
    const counts = Object.fromEntries(
      groups.map((group) => [group.status, group._count]),
    );
    const delivered = counts.DELIVERED ?? 0;
    const failed = counts.FAILED ?? 0;
    return {
      eventCount,
      deliveryCount,
      delivered,
      failed,
      successRate: deliveryCount
        ? Math.round((delivered / deliveryCount) * 1000) / 10
        : 0,
      recentEvents,
      recentFailures,
    };
  }
}
