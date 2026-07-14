import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
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
import { generateApiKey, hashApiKey } from '@hookrelay/shared';
import { AuthGuard, CurrentUserId } from './auth';
import { config } from './config';
import { ProjectsService } from './projects';

export class ApiKeyDto {
  @ApiProperty({ example: 'Production publisher' })
  @IsString()
  @Length(2, 80)
  name!: string;
}

@ApiTags('API keys')
@ApiCookieAuth()
@UseGuards(AuthGuard)
@Controller('projects/:projectId/api-keys')
export class ApiKeysController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List API key metadata' })
  async list(
    @CurrentUserId() userId: string,
    @Param('projectId') projectId: string,
  ) {
    await this.projects.requireOwned(userId, projectId);
    return this.projects.prisma.apiKey.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Create an API key; the full value is returned once',
  })
  async create(
    @CurrentUserId() userId: string,
    @Param('projectId') projectId: string,
    @Body() dto: ApiKeyDto,
  ) {
    await this.projects.requireOwned(userId, projectId);
    const { key, prefix } = generateApiKey();
    const created = await this.projects.prisma.apiKey.create({
      data: {
        projectId,
        name: dto.name.trim(),
        keyPrefix: prefix,
        keyHash: hashApiKey(key, config().API_KEY_PEPPER),
      },
    });
    return {
      id: created.id,
      name: created.name,
      keyPrefix: created.keyPrefix,
      createdAt: created.createdAt,
      apiKey: key,
    };
  }

  @Post(':keyId/revoke')
  @ApiOperation({ summary: 'Revoke an API key' })
  async revoke(
    @CurrentUserId() userId: string,
    @Param('projectId') projectId: string,
    @Param('keyId') keyId: string,
  ) {
    await this.projects.requireOwned(userId, projectId);
    const result = await this.projects.prisma.apiKey.updateMany({
      where: { id: keyId, projectId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Active API key not found');
    return { success: true };
  }
}
