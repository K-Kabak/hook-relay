import {
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { AuthGuard, CurrentUserId } from './auth';
import { PrismaService } from './prisma.service';

export class ProjectDto {
  @ApiProperty({ example: 'Payments platform' })
  @IsString()
  @Length(2, 80)
  name!: string;
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'project'
  );
}

@Injectable()
export class ProjectsService {
  constructor(readonly prisma: PrismaService) {}

  async requireOwned(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async uniqueSlug(userId: string, name: string, excludeId?: string) {
    const base = slugify(name);
    let candidate = base;
    for (
      let suffix = 2;
      await this.prisma.project.findFirst({
        where: {
          userId,
          slug: candidate,
          id: excludeId ? { not: excludeId } : undefined,
        },
      });
      suffix++
    )
      candidate = `${base}-${suffix}`;
    return candidate;
  }
}

@ApiTags('Projects')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List projects owned by the current user' })
  list(@CurrentUserId() userId: string) {
    return this.projects.prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create a project' })
  async create(@CurrentUserId() userId: string, @Body() dto: ProjectDto) {
    const name = dto.name.trim();
    return this.projects.prisma.project.create({
      data: {
        userId,
        name,
        slug: await this.projects.uniqueSlug(userId, name),
      },
    });
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Get a project' })
  get(@CurrentUserId() userId: string, @Param('projectId') projectId: string) {
    return this.projects.requireOwned(userId, projectId);
  }

  @Patch(':projectId')
  @ApiOperation({ summary: 'Rename a project' })
  async update(
    @CurrentUserId() userId: string,
    @Param('projectId') projectId: string,
    @Body() dto: ProjectDto,
  ) {
    await this.projects.requireOwned(userId, projectId);
    const name = dto.name.trim();
    return this.projects.prisma.project.update({
      where: { id: projectId },
      data: {
        name,
        slug: await this.projects.uniqueSlug(userId, name, projectId),
      },
    });
  }
}
