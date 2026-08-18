#!/bin/sh
set -eu

# An .env that still holds a placeholder gets this far and then dies deep inside Node,
# where compose only reports "container is unhealthy". Say it plainly instead.
case "${JWT_SECRET:-}" in
  "" | change_me*)
    echo "JWT_SECRET is empty or still an example placeholder." >&2
    echo "The backend cannot sign tokens with it, so it refuses to start." >&2
    echo "  Windows: run start_docker.bat, which fills the empty values in for you." >&2
    echo "  Other  : set JWT_SECRET in .env (openssl rand -hex 32), then start again." >&2
    exit 1
    ;;
esac

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
  echo "If the error above mentions INITIAL_ADMIN_PASSWORD, .env leaves it empty or still" >&2
  echo "holds an example placeholder." >&2
  echo "  Windows: run start_docker.bat, which fills the empty values in for you." >&2
  echo "  Other  : set it in .env (12 characters or more), then start again." >&2
  exit 1
fi

echo "Starting backend..."
exec node dist/src/main.js
