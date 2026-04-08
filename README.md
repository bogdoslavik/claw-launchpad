# claw-launchpad

Minimal Launchpad for provisioning OpenClaw on a user's DigitalOcean account.

## V1 scope

- Login with DigitalOcean via OAuth
- Create a Droplet with cloud-init
- Install and start OpenClaw
- Configure Telegram + OpenRouter
- Track deployment status
- No OpenClaw browser UI in V1

## Workspace

- `apps/api`: Fastify API for OAuth, deployments, and callbacks
- `apps/web`: Next.js control UI for Launchpad itself
- `apps/worker`: deployment tracker worker with `pg-boss` scheduling on PostgreSQL
- `packages/core`: domain logic, cloud-init generation, stores, tracker
- `packages/testing`: fakes for unit and integration tests

## Local run

1. Install dependencies:

```bash
npm install
```

2. Start PostgreSQL locally or via Docker:

```bash
npm run db:up
```

3. Apply database migrations:

```bash
npm run db:migrate:deploy
```

4. Configure the API:

```bash
cp apps/api/.env.example apps/api/.env
```

5. Configure the web app:

```bash
cp apps/web/.env.example apps/web/.env.local
```

6. Start the services in separate shells:

```bash
npm run dev:api
npm run dev:web
npm run dev:worker
```

## Docker compose

1. Create a root docker env file:

```bash
cp .env.docker.example .env
```

2. Fill in `COOKIE_SECRET`, `DIGITALOCEAN_CLIENT_ID`, and `DIGITALOCEAN_CLIENT_SECRET`.

3. Start the full stack:

```bash
docker compose up --build
```

## Quality checks

```bash
npm run db:generate
npm run typecheck
npm test
```

## Important defaults

- DigitalOcean image: `ubuntu-24-04-x64`
- DigitalOcean size: `s-1vcpu-1gb`
- OpenClaw image: `ghcr.io/openclaw/openclaw:2026.4.8`
- Model: `openrouter/auto`
- Persistence: PostgreSQL via Prisma when `DATABASE_URL` is set
- Worker scheduling: `pg-boss` when `DATABASE_URL` is set, interval fallback otherwise
