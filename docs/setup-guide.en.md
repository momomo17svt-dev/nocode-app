# Setup guide

*[日本語版](setup-guide.md)*

How to run NoCode App on a LAN, including networks with no route to the internet. Docker is the
recommended path on every operating system.

## Docker (any OS)

Requires Docker with the Compose plugin. Nothing else — Node.js and PostgreSQL run inside the
containers.

```bash
cp .env.example .env
```

A straight copy of `.env` already runs. The two secrets are `sample_only_` values that
**this repository publishes**, so unless nobody else can reach the machine, replace them
(on Windows, `start_docker.bat` replaces every `sample_only_` value for you):

| Variable | What to put there |
| --- | --- |
| `POSTGRES_PASSWORD` | Any strong password. Only the containers use it |
| `JWT_SECRET` | 32+ random characters. Changing it later invalidates all sessions |
| `INITIAL_ADMIN_PASSWORD` | Leave empty. The administrator is created in the browser on the first run (set 12+ characters only for unattended provisioning) |

`openssl rand -hex 32` produces a suitable `JWT_SECRET`.

```bash
docker compose up -d --build
```

Then open <http://localhost:5173> and sign in as `admin` with the password you set. The
administrator is created only on the first run against an empty database.

```bash
docker compose logs -f backend   # follow logs
docker compose down              # stop (keeps the database volume)
```

On Windows, `start_docker.bat` wraps the two steps above and generates the secrets for you, so you
never have to edit `.env` by hand. `stop_docker.bat` and `logs_docker.bat` are the matching
wrappers. See the [Docker guide](docker-guide.md) for volumes, ports, and upgrades.

### Publishing behind HTTPS

Set `AUTH_COOKIE_SECURE=true` when a TLS terminator sits in front of the stack. Leave it `false`
for plain HTTP on a LAN, otherwise the browser will drop the session cookie.

## Windows without Docker

Use this only when Docker is unavailable. It is the path the `.bat` scripts were written for.

### Prerequisites

- Node.js 22
- PostgreSQL 16 or later
- Access to an npm registry, or a pre-built offline bundle of the dependencies

**PostgreSQL is not included in this repository.** It is excluded for licensing and size reasons.
Provide it in one of these ways:

- Install PostgreSQL 16+ normally, or
- Download the portable Windows binaries (EnterpriseDB "Windows x86-64 binaries" zip) from
  <https://www.enterprisedb.com/download-postgresql-binaries>

Extract the portable build into `pgsql/` at the project root, so that `pgsql\bin\postgres.exe`
exists. To keep it elsewhere, point `NOCODEAPP_PG_HOME` at its root directory before starting:

```powershell
$env:NOCODEAPP_PG_HOME = 'C:\path\to\postgresql'
```

`extract-postgresql.bat` is a helper for offline distribution bundles that ship a `postgresql.zip`.
A fresh `git clone` has no such zip, so prepare `pgsql/` using one of the options above.

### First run

Run `setup.bat`. It performs, in order:

1. Creates `backend/.env` with freshly generated secrets
2. Initialises PostgreSQL and creates the `nocode_db` database
3. Applies Prisma migrations
4. Creates the initial administrator
5. Builds the backend and verifies frontend dependencies

The administrator password is printed **only** when the environment file is created for the first
time. There is no fixed default password.

> [!WARNING]
> `setup.bat` runs `initdb` without specifying an authentication method, so local connections use
> `trust` (no password). PostgreSQL listens on localhost only by default, but if other people share
> the same machine, use the Docker path instead, or configure `pg_hba.conf` and a password yourself.

### Starting

Run `start_server.bat`, then open <http://localhost:5173>.

The batch setup serves the backend on port 3001 and the frontend on 5173. To reach it from another
PC on the LAN, add the real frontend URL to `CORS_ORIGINS` in `backend/.env` and open the port in
Windows Firewall.

## Manual setup (development)

Copy `backend/.env.example` to `backend/.env`. It runs as it is, but `JWT_SECRET` is a
published sample value, so replace it with your own. The administrator is created in the
browser on the first run.

```bash
cd backend
npm ci
npm run db:setup
npm run start
```

In a second terminal:

```bash
cd frontend
npm ci
npm run dev -- --host 0.0.0.0
```

## Backups

Always save the database and `storage/attachments/` together — a database dump alone cannot restore
attachments. Dumps and attachments may contain confidential data, so never commit them to Git.

```text
export-db.bat
```

For the Docker setup, see the [Docker guide](docker-guide.md) and the
[backup and restore guide](backup-restore-guide.md).

## Operational notes

- Changing `JWT_SECRET` signs everyone out.
- Never share or publish `.env` or `backend/.env`.
- The Docker and batch setups both use port 5173 and cannot run at the same time.
- Exposing the app directly to the internet needs the additional measures listed in
  [SECURITY.md](../SECURITY.md) and the caveats in [known issues](known-issues.md).
