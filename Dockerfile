# Pinned rather than left to the builder to choose.
#
# Nixpacks picks a Node version from a nixpkgs snapshot it controls, so
# `.nvmrc` and `engines` only narrow the choice — they cannot name a patch
# version. That produced two failed deploys in a row: first Node 18, which
# `@eslint/config-inspector` rejects, then 24.10.0, which
# `jsdoc-type-pratt-parser` rejects for wanting >=24.15.0. A Dockerfile ends
# the guessing, and builds the same way here as on Railway.
FROM node:26-slim AS build

WORKDIR /app

# Recent Node images no longer bundle Yarn, so it is installed explicitly and
# pinned to the version that wrote the lockfile.
RUN npm install --global yarn@1.22.22

# Dependencies first, so a source-only change reuses the cached install layer.
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

# Nuxt's build output bundles everything it needs, so the runtime image gets
# the output and nothing else — no node_modules, no source, no yarn.
FROM node:26-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

# Listen on every interface, but let the platform choose the port. Railway
# injects PORT and health-checks that, and Nitro resolves NITRO_PORT before
# PORT — so pinning NITRO_PORT here makes the app listen on 3000 while the
# healthcheck knocks on another door, which fails the deploy with nothing in
# the logs to explain it. Nitro falls back to 3000 when PORT is unset.
ENV NITRO_HOST=0.0.0.0

# Runs as root, deliberately. Railway mounts a volume owned by root, and a
# non-root process cannot create the store directory inside it — which fails
# on the first sign-in rather than at boot, so it looks like a broken app
# rather than a permissions problem. Dropping privileges would mean an
# entrypoint that chowns the mount and then steps down, which is more moving
# parts than a single-tenant app on one replica earns. If you do want a
# non-root user, chown the volume's mount path to it first.
COPY --from=build /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
