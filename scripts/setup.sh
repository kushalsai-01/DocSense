#!/usr/bin/env bash
# DocSense — first-time environment setup
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${SCRIPT_DIR}/.."

echo ""
echo "======================================"
echo "  DocSense — environment setup"
echo "======================================"
echo ""

# 1. Copy env example files (skip if already exist)
for example in "${ROOT}"/infra/compose/env/*.env.example; do
  dest="${example%.example}"
  if [ -f "${dest}" ]; then
    echo "  [skip] $(basename "${dest}") already exists"
  else
    cp "${example}" "${dest}"
    echo "  [ok]   $(basename "${dest}") created"
  fi
done

echo ""
echo "Generating cryptographic secrets..."

JWT_SECRET="$(openssl rand -base64 64 | tr -d '\n')"
JWT_REFRESH="$(openssl rand -base64 64 | tr -d '\n')"
PG_PASS="$(openssl rand -base64 32 | tr -d '\n')"

# Patch api.env
API_ENV="${ROOT}/infra/compose/env/api.env"
sed -i "s|CHANGE_ME_run_openssl_rand_-base64_64|${JWT_SECRET}|1" "${API_ENV}"
sed -i "s|CHANGE_ME_run_openssl_rand_-base64_64|${JWT_REFRESH}|1" "${API_ENV}"
sed -i "s|CHANGE_ME@postgres|${PG_PASS}@postgres|g" "${API_ENV}"

# Patch agent.env
sed -i "s|CHANGE_ME@postgres|${PG_PASS}@postgres|g" "${ROOT}/infra/compose/env/agent.env"

# Write a root .env for docker-compose POSTGRES_PASSWORD
ROOT_ENV="${ROOT}/.env"
if [ ! -f "${ROOT_ENV}" ]; then
  echo "POSTGRES_PASSWORD=${PG_PASS}" > "${ROOT_ENV}"
  echo "  [ok]   .env created with POSTGRES_PASSWORD"
else
  # Update only if it contains the placeholder
  if grep -q "CHANGE_ME" "${ROOT_ENV}" 2>/dev/null; then
    sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PASS}|" "${ROOT_ENV}"
  fi
fi

echo ""
echo "======================================"
echo "  Setup complete!"
echo "======================================"
echo ""
echo "  Next steps:"
echo "  1. Edit infra/compose/env/agent.env — add your OPENAI_API_KEY"
echo "  2. Edit infra/compose/env/rag.env   — add your OPENAI_API_KEY"
echo "  3. Run: docker compose up -d --build"
echo ""
