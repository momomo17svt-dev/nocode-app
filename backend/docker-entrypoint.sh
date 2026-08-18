#!/bin/sh
set -eu

echo "Waiting for PostgreSQL..."
attempt=0
until node -e "const {Client}=require('pg'); const client=new Client({connectionString:process.env.DATABASE_URL}); client.connect().then(()=>client.end()).then(()=>process.exit(0)).catch(()=>process.exit(1));"
do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "PostgreSQL did not become ready in time." >&2
    exit 1
  fi
  sleep 2
done

echo "Applying Prisma migrations..."
npx --no-install prisma migrate deploy

echo "Ensuring the initial administrator exists..."
if ! node dist/prisma/seed.js; then
  echo "" >&2
  echo "Initial setup failed, so this container will keep restarting and stay unhealthy." >&2
  echo "If the error above mentions INITIAL_ADMIN_PASSWORD or JWT_SECRET, .env still holds" >&2
  echo "the change_me placeholders that .env.example ships with." >&2
  echo "  Windows: run start_docker.bat, which fills those values in for you." >&2
  echo "  Other  : replace them in .env, then run docker compose up -d again." >&2
  exit 1
fi

echo "Starting backend..."
exec node dist/src/main.js
