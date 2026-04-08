export const deploymentStatuses = [
  "requested",
  "droplet_creating",
  "droplet_active",
  "bootstrapping",
  "running",
  "failed",
  "canceled",
] as const;

export type DeploymentStatus = (typeof deploymentStatuses)[number];

export const deploymentCallbackStages = [
  "cloud_init_started",
  "docker_installed",
  "openclaw_started",
  "failed",
] as const;

export type DeploymentCallbackStage = (typeof deploymentCallbackStages)[number];

export const deploymentEventTypes = [
  "oauth_connected",
  "droplet_create_requested",
  "droplet_action_completed",
  "cloud_init_started",
  "docker_installed",
  "openclaw_started",
  "failed",
  "canceled",
] as const;

export type DeploymentEventType = (typeof deploymentEventTypes)[number];

export interface User {
  id: string;
  createdAt: string;
  updatedAt: string;
  doUserUuid: string;
  doTeamUuid: string;
  email?: string;
}

export interface DigitalOceanIdentity {
  uuid: string;
  teamUuid: string;
  email?: string;
}

export interface DigitalOceanTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope: string[];
  identity: DigitalOceanIdentity;
}

export interface Deployment {
  id: string;
  userId: string;
  status: DeploymentStatus;
  idempotencyKey: string;
  dropletId?: number;
  dropletName: string;
  actionId?: number;
  region: string;
  sizeSlug: string;
  imageSlug: string;
  publicIpv4?: string;
  openclawImage: string;
  openclawModel: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
}

export interface DeploymentCallbackRecord {
  deploymentId: string;
  bootstrapTokenHash: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentCredential {
  deploymentId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeploymentEvent {
  id: string;
  deploymentId: string;
  ts: string;
  type: DeploymentEventType;
  payload?: Record<string, unknown>;
}

export interface DeploymentDetails {
  deployment: Deployment;
  callback?: DeploymentCallbackRecord;
  events: DeploymentEvent[];
}

export interface CreateDeploymentRequest {
  userId: string;
  idempotencyKey: string;
  telegramBotToken: string;
  telegramUserId?: string;
  openRouterApiKey: string;
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt: string;
  region?: string;
  sizeSlug?: string;
  imageSlug?: string;
}

export interface CreateDeploymentResult {
  deployment: Deployment;
}

export interface DeploymentCallbackInput {
  deploymentId: string;
  token: string;
  stage: DeploymentCallbackStage;
  details?: Record<string, unknown>;
}

export interface TrackDeploymentResult {
  deployment: Deployment;
  actionStatus?: string;
}

export interface DropletNetworkV4 {
  ipAddress: string;
  type: "public" | "private";
}

export interface DigitalOceanDroplet {
  id: number;
  name?: string;
  networksV4: DropletNetworkV4[];
}

export interface DigitalOceanAction {
  id: number;
  status: string;
}

export interface CreateDropletCommand {
  name: string;
  region: string;
  size: string;
  image: string;
  userData: string;
}

export interface CreateDropletResult {
  dropletId: number;
  actionId?: number;
}

export interface DigitalOceanClient {
  createDroplet(accessToken: string, command: CreateDropletCommand): Promise<CreateDropletResult>;
  getDroplet(accessToken: string, dropletId: number): Promise<DigitalOceanDroplet>;
  getAction(accessToken: string, actionId: number): Promise<DigitalOceanAction>;
}

export interface DigitalOceanOAuthClient {
  createAuthorizeUrl(params: { state: string; redirectUri: string; scopes: string[] }): string;
  exchangeCode(params: { code: string; redirectUri: string }): Promise<DigitalOceanTokenSet>;
  revokeToken(token: string): Promise<void>;
}

export interface Clock {
  now(): Date;
}

export interface LaunchpadStore {
  upsertUser(identity: DigitalOceanIdentity, nowIso: string): Promise<User>;
  findUserById(userId: string): Promise<User | undefined>;
  createDeployment(deployment: Deployment): Promise<Deployment>;
  updateDeployment(
    deploymentId: string,
    updater: (current: Deployment) => Deployment,
  ): Promise<Deployment>;
  findDeploymentById(deploymentId: string): Promise<Deployment | undefined>;
  findDeploymentByIdempotencyKey(userId: string, idempotencyKey: string): Promise<Deployment | undefined>;
  listDeploymentsByUser(userId: string): Promise<Deployment[]>;
  listDeploymentsNeedingTracking(): Promise<Deployment[]>;
  saveDeploymentCallback(record: DeploymentCallbackRecord): Promise<DeploymentCallbackRecord>;
  findDeploymentCallback(deploymentId: string): Promise<DeploymentCallbackRecord | undefined>;
  saveDeploymentCredential(record: DeploymentCredential): Promise<DeploymentCredential>;
  findDeploymentCredential(deploymentId: string): Promise<DeploymentCredential | undefined>;
  deleteDeploymentCredential(deploymentId: string): Promise<void>;
  appendEvent(event: DeploymentEvent): Promise<DeploymentEvent>;
  listDeploymentEvents(deploymentId: string): Promise<DeploymentEvent[]>;
}

export interface CloudInitOptions {
  callbackUrl: string;
  deploymentId: string;
  bootstrapToken: string;
  telegramBotToken: string;
  telegramUserId?: string;
  openRouterApiKey: string;
  gatewayToken: string;
  openclawImage: string;
  openclawModel: string;
  debugSshUser?: string;
  debugSshPublicKey?: string;
}

export interface LaunchpadDefaults {
  callbackTokenTtlHours: number;
  dropletImage: string;
  dropletRegion: string;
  dropletSize: string;
  gatewayPort: number;
  openclawImage: string;
  openclawModel: string;
}
