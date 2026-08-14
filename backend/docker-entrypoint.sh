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
node dist/prisma/seed.js

echo "Starting backend..."
exec node dist/src/main.js
