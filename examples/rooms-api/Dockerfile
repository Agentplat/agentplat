FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages

# Build every public package before linking the standalone reference app.
RUN pnpm install --frozen-lockfile \
  && pnpm -r run build

COPY examples/rooms-api ./examples/rooms-api

RUN pnpm --dir examples/rooms-api install --prod --frozen-lockfile --ignore-workspace

ENV NODE_ENV=production

USER node

EXPOSE 3000

CMD ["pnpm", "--dir", "examples/rooms-api", "start"]
