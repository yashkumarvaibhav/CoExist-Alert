# CoExist Alert — zero-setup container image.
# Judges run `docker compose up` and get a fixed Node 24 + glibc runtime,
# so the app never depends on the host's Node version or system libraries.

FROM node:24-bookworm-slim

# Build toolchain for better-sqlite3's native addon. The base image's glibc is
# modern, so the prebuilt binary normally loads directly; these are the fallback
# that lets node-gyp compile from source if a prebuild is ever unavailable.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first so this layer is cached across source changes.
# scripts/ is copied too because package.json's preinstall guard runs it.
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

# Copy the rest of the source (see .dockerignore for what's excluded).
COPY . .

# Migrate + seed the bundled SQLite DB, then compile a production build so the
# image ships demo-ready and serves the same clean production UI as the hosted
# site — no dev-only overlay, no on-demand compilation, fast first paint.
RUN npm run setup
RUN npm run build

EXPOSE 3021

# Serve the production build, bound to 0.0.0.0 so the mapped port reaches the host.
CMD ["npx", "next", "start", "--port", "3021", "--hostname", "0.0.0.0"]
