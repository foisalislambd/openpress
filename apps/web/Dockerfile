FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/plugin-sdk/package.json packages/plugin-sdk/
COPY packages/theme-sdk/package.json packages/theme-sdk/
COPY packages/create-openpress/package.json packages/create-openpress/
COPY packages/themes/default/package.json packages/themes/default/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @openpress/web build
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
