#!/bin/bash
# Prepares a cloud session container: Node from .nvmrc, Docker, Postgres 17, dependencies and .env (D-105).
# The environment's Setup script installs Node, dependencies and .env, but leaves no process running:
# run this in the session before any test, and again after the container restarts, to start Docker and Postgres.
# Safe to run more than once. Needs no secret: the tests use the fake providers.
set -eo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# 1. Node from .nvmrc. Sourcing nvm.sh returns 3 while there is no default version.
export NVM_DIR=/opt/nvm
source "$NVM_DIR/nvm.sh" || true
NODE_VERSION="$(cat .nvmrc)"
nvm install "$NODE_VERSION" || { echo "nvm install $NODE_VERSION failed" >&2; exit 1; }

# The image puts Node 22 (/opt/node22/bin) on PATH, and the session shell never loads nvm.
# ~/.local/bin comes earlier on PATH, so links there make every session shell use this Node.
NODE_BIN="$(dirname "$(nvm which "$NODE_VERSION")")"
[ -x "$NODE_BIN/node" ] || { echo "Node $NODE_VERSION not found in nvm" >&2; exit 1; }
mkdir -p "$HOME/.local/bin"
for tool in node npm npx; do ln -sfn "$NODE_BIN/$tool" "$HOME/.local/bin/$tool"; done

# 2. Docker. The container has no systemd, so the daemon starts here, outside this script's process group.
if ! docker info >/dev/null 2>&1; then
  setsid nohup dockerd >/tmp/dockerd.log 2>&1 </dev/null &
  for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 1; done
  docker info >/dev/null 2>&1 || { echo "dockerd did not start (see /tmp/dockerd.log)" >&2; exit 1; }
fi

# 3. Dependencies. The project's postinstall generates the Prisma client in src/generated/prisma.
npm ci
[ -f src/generated/prisma/client.ts ] || npm run db:generate

# 4. Postgres 17 from docker-compose.yml (databases agenda and agenda_test), waiting until healthy.
#    Not the machine's Postgres 16, which stays stopped.
npm run db:up

# 5. .env from the example, with no values: tests/setup-env.ts fixes secrets and providers.
[ -f .env ] || cp .env.example .env
git check-ignore -q .env || { echo ".env is not ignored by git" >&2; exit 1; }

echo "Ready: Node $(node -v), $(docker exec agenda-postgres postgres --version)."
