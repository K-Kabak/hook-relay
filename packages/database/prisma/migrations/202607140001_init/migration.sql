CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'RETRYING', 'FAILED');

CREATE TABLE "User" ("id" UUID NOT NULL, "email" TEXT NOT NULL, "passwordHash" TEXT NOT NULL, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Project" ("id" UUID NOT NULL, "userId" UUID NOT NULL, "name" TEXT NOT NULL, "slug" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Project_pkey" PRIMARY KEY ("id"));
CREATE TABLE "ApiKey" ("id" UUID NOT NULL, "projectId" UUID NOT NULL, "name" TEXT NOT NULL, "keyPrefix" TEXT NOT NULL, "keyHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastUsedAt" TIMESTAMP(3), "revokedAt" TIMESTAMP(3), CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id"));
CREATE TABLE "WebhookEndpoint" ("id" UUID NOT NULL, "projectId" UUID NOT NULL, "name" TEXT NOT NULL, "url" TEXT NOT NULL, "secret" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Event" ("id" UUID NOT NULL, "projectId" UUID NOT NULL, "type" TEXT NOT NULL, "payload" JSONB NOT NULL, "idempotencyKey" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Event_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Delivery" ("id" UUID NOT NULL, "eventId" UUID NOT NULL, "endpointId" UUID NOT NULL, "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING', "attemptCount" INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMP(3), "lastStatusCode" INTEGER, "lastResponseBody" TEXT, "lastError" TEXT, "deliveredAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id"));
CREATE TABLE "DeliveryAttempt" ("id" UUID NOT NULL, "deliveryId" UUID NOT NULL, "attemptNumber" INTEGER NOT NULL, "statusCode" INTEGER, "responseBody" TEXT, "error" TEXT, "durationMs" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Project_userId_slug_key" ON "Project"("userId", "slug");
CREATE INDEX "Project_userId_idx" ON "Project"("userId");
CREATE INDEX "ApiKey_keyPrefix_idx" ON "ApiKey"("keyPrefix");
CREATE INDEX "ApiKey_projectId_revokedAt_idx" ON "ApiKey"("projectId", "revokedAt");
CREATE INDEX "WebhookEndpoint_projectId_isActive_idx" ON "WebhookEndpoint"("projectId", "isActive");
CREATE UNIQUE INDEX "Event_projectId_idempotencyKey_key" ON "Event"("projectId", "idempotencyKey");
CREATE INDEX "Event_projectId_createdAt_idx" ON "Event"("projectId", "createdAt" DESC);
CREATE UNIQUE INDEX "Delivery_eventId_endpointId_key" ON "Delivery"("eventId", "endpointId");
CREATE INDEX "Delivery_eventId_idx" ON "Delivery"("eventId");
CREATE INDEX "Delivery_endpointId_status_idx" ON "Delivery"("endpointId", "status");
CREATE INDEX "Delivery_status_nextAttemptAt_idx" ON "Delivery"("status", "nextAttemptAt");
CREATE UNIQUE INDEX "DeliveryAttempt_deliveryId_attemptNumber_key" ON "DeliveryAttempt"("deliveryId", "attemptNumber");
CREATE INDEX "DeliveryAttempt_deliveryId_createdAt_idx" ON "DeliveryAttempt"("deliveryId", "createdAt");

ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

