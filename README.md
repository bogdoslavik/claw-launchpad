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
- `apps/worker`: polling worker for deployment tracking
- `packages/core`: domain logic, cloud-init generation, stores, tracker
- `packages/testing`: fakes for unit and integration tests

## Local run

1. Install dependencies:

```bash
npm install
```

2. Configure the API:

```bash
cp apps/api/.env.example apps/api/.env
```

3. Configure the web app:

```bash
cp apps/web/.env.example apps/web/.env.local
```

4. Start the services in separate shells:

```bash
npm run dev:api
npm run dev:web
npm run dev:worker
```

## Quality checks

```bash
npm run typecheck
npm test
```

## Important defaults

- DigitalOcean image: `ubuntu-24-04-x64`
- DigitalOcean size: `s-1vcpu-1gb`
- OpenClaw image: `ghcr.io/openclaw/openclaw:2026.4.8`
- Model: `openrouter/auto`

