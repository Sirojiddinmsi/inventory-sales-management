#!/usr/bin/env bash
set -euo pipefail

env_file=/opt/tikuv-market/.env

if ! grep -q '^PUBLIC_API_URL=' "$env_file"; then
  printf '%s\n' 'PUBLIC_API_URL=http://95.216.184.39' >> "$env_file"
fi

chmod 0600 "$env_file"
echo "ENV_UPDATED"
