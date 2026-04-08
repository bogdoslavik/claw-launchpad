FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
COPY tsconfig.base.json vitest.config.ts ./
COPY apps ./apps
COPY packages ./packages

RUN npm ci

EXPOSE 3001

CMD ["npm", "run", "start", "--workspace", "@launchpad/api"]

