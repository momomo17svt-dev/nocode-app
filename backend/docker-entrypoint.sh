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

# Swallowing the connection error makes a rejected password look like "still starting up",
# and the wait only ends two minutes later with a misleading message. Exit code 2 marks
# the errors that waiting can never fix.
probe_postgres() {
  node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client
  .connect()
  .then(() => client.end())
  .then(() => process.exit(0))
  .catch((error) => {
    process.stderr.write((error.code ? error.code + ' ' : '') + (error.message || String(error)) + '\n');
    process.exit(error.code === '28P01' || error.code === '28000' ? 2 : 1);
  });
"
}

echo "Waiting for PostgreSQL..."
attempt=0
until db_error=$(probe_postgres 2>&1); do
  status=$?
  if [ "$status" -eq 2 ]; then
    echo "PostgreSQL rejected the credentials from .env:" >&2
    echo "  $db_error" >&2
    echo "PostgreSQL only reads POSTGRES_PASSWORD while it creates its data directory, so a" >&2
    echo "changed password never reaches an existing volume. Restore the previous value, or" >&2
    echo "start the database over with: docker compose down -v   (this deletes its data)." >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "PostgreSQL did not become ready in time. Last error:" >&2
    echo "  $db_error" >&2
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
  echo "If the error above mentions INITIAL_ADMIN_PASSWORD, .env holds a value the app" >&2
  echo "cannot use. Leave it empty to create the administrator in the browser instead," >&2
  echo "or set a password of 12 characters or more for unattended provisioning." >&2
  exit 1
fi

echo "Starting backend..."
exec node dist/src/main.js
