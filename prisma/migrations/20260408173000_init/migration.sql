-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('requested', 'droplet_creating', 'droplet_active', 'bootstrapping', 'running', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "DeploymentEventType" AS ENUM ('oauth_connected', 'droplet_create_requested', 'droplet_action_completed', 'cloud_init_started', 'docker_installed', 'openclaw_started', 'failed', 'canceled');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "doUserUuid" TEXT NOT NULL,
    "doTeamUuid" TEXT NOT NULL,
    "email" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DeploymentStatus" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "dropletId" INTEGER,
    "dropletName" TEXT NOT NULL,
    "actionId" INTEGER,
    "region" TEXT NOT NULL,
    "sizeSlug" TEXT NOT NULL,
    "imageSlug" TEXT NOT NULL,
    "publicIpv4" TEXT,
    "openclawImage" TEXT NOT NULL,
    "openclawModel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentCallback" (
    "deploymentId" TEXT NOT NULL,
    "bootstrapTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentCallback_pkey" PRIMARY KEY ("deploymentId")
);

-- CreateTable
CREATE TABLE "DeploymentCredential" (
    "deploymentId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentCredential_pkey" PRIMARY KEY ("deploymentId")
);

-- CreateTable
CREATE TABLE "DeploymentEvent" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "type" "DeploymentEventType" NOT NULL,
    "payload" JSONB,

    CONSTRAINT "DeploymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_doUserUuid_doTeamUuid_key" ON "User"("doUserUuid", "doTeamUuid");

-- CreateIndex
CREATE INDEX "Deployment_status_idx" ON "Deployment"("status");

-- CreateIndex
CREATE INDEX "Deployment_userId_createdAt_idx" ON "Deployment"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Deployment_userId_idempotencyKey_key" ON "Deployment"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "DeploymentEvent_deploymentId_ts_idx" ON "DeploymentEvent"("deploymentId", "ts");

-- CreateIndex
CREATE INDEX "ApiSession_userId_updatedAt_idx" ON "ApiSession"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentCallback" ADD CONSTRAINT "DeploymentCallback_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentCredential" ADD CONSTRAINT "DeploymentCredential_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentEvent" ADD CONSTRAINT "DeploymentEvent_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiSession" ADD CONSTRAINT "ApiSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

