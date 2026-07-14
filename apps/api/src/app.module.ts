import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController, AuthGuard } from './auth';
import { ApiKeysController } from './api-keys';
import { DashboardController } from './dashboard';
import { DevReceiverController } from './dev-receiver';
import { EndpointsController } from './endpoints';
import { EventIngestionController, EventsService, HistoryController } from './events';
import { config } from './config';
import { PrismaService } from './prisma.service';
import { ProjectsController, ProjectsService } from './projects';
import { DeliveryQueue } from './queue.service';

@Module({
  imports: [JwtModule.register({ global: true, secret: config().JWT_SECRET, signOptions: { expiresIn: config().JWT_EXPIRES_IN as any } })],
  controllers: [AuthController, ProjectsController, ApiKeysController, EndpointsController, EventIngestionController, HistoryController, DashboardController, DevReceiverController],
  providers: [PrismaService, ProjectsService, DeliveryQueue, EventsService, AuthGuard],
})
export class AppModule {}
