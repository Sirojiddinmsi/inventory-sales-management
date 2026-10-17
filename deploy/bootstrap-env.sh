#!/usr/bin/env bash
set -euo pipefail

app_dir=/opt/tikuv-market
env_file="$app_dir/.env"

install -d -m 0755 "$app_dir/uploads/products"

if [[ -e "$env_file" ]]; then
  echo "ENV_ALREADY_EXISTS"
  exit 0
fi

postgres_password="$(openssl rand -hex 32)"
jwt_secret="$(openssl rand -hex 64)"

umask 077
printf '%s\n' \
  'COMPOSE_PROJECT_NAME=tikuv-market' \
  'POSTGRES_DB=inventory_sales' \
  'POSTGRES_USER=inventory' \
  "POSTGRES_PASSWORD=$postgres_password" \
  "JWT_SECRET=$jwt_secret" \
  'JWT_EXPIRES_IN=1d' \
  'CORS_ORIGIN=http://95.216.184.39' \
  'PUBLIC_API_URL=http://95.216.184.39' \
  'APP_TIMEZONE=Asia/Tashkent' \
  'RATE_LIMIT_WINDOW_MS=900000' \
  'RATE_LIMIT_MAX=200' \
  > "$env_file"

chmod 0600 "$env_file"
echo "ENV_CREATED"
