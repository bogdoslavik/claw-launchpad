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

2. Create the shared backend env file:

```bash
cp .env.example .env
```

Edit `.env` and fill only:
`COOKIE_SECRET`, `DATABASE_URL`, `DIGITALOCEAN_CLIENT_ID`, `DIGITALOCEAN_CLIENT_SECRET`

3. Configure the web app:

```bash
cp apps/web/.env.example apps/web/.env.local
```

`apps/web/.env.local` is optional for local dev because the UI already defaults to `http://localhost:3001`.

4. Start PostgreSQL locally or via Docker:

```bash
npm run db:up
```

5. Apply database migrations:

```bash
npm run db:migrate:deploy
```

6. Start the services in separate shells:

```bash
npm run dev:api
npm run dev:web
npm run dev:worker
```

7. For a real DigitalOcean demo from your laptop, `LAUNCHPAD_PUBLIC_API_URL` in [`.env.example`](/home/dev/claw-launchpad/.env.example) must be a public HTTPS URL that forwards to your local API.
   If it stays `http://localhost:3001`, the Droplet will not be able to send bootstrap callbacks back to Launchpad.
   Optional overrides when you are not on localhost:
   `DIGITALOCEAN_REDIRECT_URI`, `LAUNCHPAD_PUBLIC_API_URL`, `LAUNCHPAD_WEB_URL`, `NEXT_PUBLIC_LAUNCHPAD_API_URL`

## Docker compose

1. Create a root docker env file:

```bash
cp .env.docker.example .env
```

2. Fill in:
   `COOKIE_SECRET`, `DATABASE_URL`, `DIGITALOCEAN_CLIENT_ID`, `DIGITALOCEAN_CLIENT_SECRET`

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
- API session TTL: `24h`, capped by the DigitalOcean OAuth token expiry
- API logs: request IDs + redaction for OAuth/session/app secrets
- Host, port, OAuth scopes, worker poll interval and local store paths are fixed in `config.ts`
- Worker scheduling: `pg-boss` when `DATABASE_URL` is set, interval fallback otherwise
