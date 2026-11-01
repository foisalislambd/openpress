FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/themes/default/package.json packages/themes/default/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @openpress/web build
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
