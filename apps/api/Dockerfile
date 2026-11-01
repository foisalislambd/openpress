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
RUN pnpm --filter @openpress/api build
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
