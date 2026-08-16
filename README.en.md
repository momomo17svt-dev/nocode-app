# NoCode App

*[日本語版 README](README.md)*

NoCode App is a self-hosted business application platform that runs on a LAN, including fully
offline networks. It provides forms, list/board/calendar/map views, permissions, workflow,
dashboards, audit logs, and optional LLM integration — all without writing code.

> This is `v0.1.0`. Before exposing it directly to the internet, read [SECURITY.md](SECURITY.md)
> and the [known issues](docs/known-issues.md).

## Stack

- Backend: NestJS 11 / Prisma 7 / PostgreSQL / JWT in an HttpOnly cookie
- Frontend: React 19 / TypeScript / Vite / Tailwind CSS
- Storage: local attachments and optional offline map tiles
- AI (optional): LM Studio, Ollama, OpenAI, OpenRouter, Groq, Gemini, Mistral, or any
  OpenAI-compatible API

Requires Node.js 22 and PostgreSQL 16 or later.

## Run with Docker

On Windows, start Docker Desktop and run `start_docker.bat`. The first run generates a random
database password, JWT secret, and administrator password, and prints the administrator
credentials once. Then open <http://localhost:5173>.

To start it manually, copy `.env.example` to `.env`, replace every `change_me` value, and run:

```bash
docker compose up -d --build
```

`stop_docker.bat` and `logs_docker.bat` stop the stack and tail its logs.

## Run without Docker (Windows)

PostgreSQL is **not** bundled with this repository. Install PostgreSQL 16+, or download the
portable Windows binaries and extract them to `pgsql/` so that `pgsql\bin\postgres.exe` exists.
If PostgreSQL lives elsewhere, set `NOCODEAPP_PG_HOME` to its root directory.

```text
setup.bat
start_server.bat
```

`setup.bat` generates the environment and initial administrator, runs migrations, and builds.
The Docker and batch setups both use port 5173, so do not run them at the same time.

See the [setup guide](docs/setup-guide.md) and [Docker guide](docs/docker-guide.md) for details.

## Language

Japanese and English can be switched from the header or the login screen. The choice is stored
per browser. Dates, times, and numbers follow the selected language. Business data entered into
your apps is never machine-translated.

When you add or change UI text, run `npm run i18n:audit` in `frontend/` to find Japanese strings
that have no English translation. CI runs the same check.

## AI integration (optional)

An administrator configures the provider, base URL, chat model, and embedding model. API keys can
be stored for cloud providers but are never returned to the UI or the settings API. AI search
additionally requires the endpoint to support an embeddings API.

The assistant starts with **no data access**. Before asking a question, you explicitly choose the
scope: no reference (plain chat), app data only, knowledge documents only, or both. Changing the
scope starts a new conversation so earlier sources do not leak into later answers.

Knowledge documents are published either company-wide or to selected departments, optionally
including sub-departments. Document lists, document bodies, and AI search all apply the same
department rules, so documents you cannot read never become the basis for an answer.

## Data and backups

- The Docker database lives in a named volume; the batch setup uses the PostgreSQL data directory
  you configured.
- Attachments are stored under `storage/attachments/`.
- Administrators can schedule daily database backups from the system settings screen. Dumps are
  written to `storage/backups/`.
- Database dumps, attachments, environment files, and map caches are excluded from Git.

Run `export-db.bat` before moving the folder to another PC. See the
[backup and restore guide](docs/backup-restore-guide.md) and
[offline migration guide](docs/offline-migration.md).

## Development

```bash
cd backend
npm ci
npm run build
npm test -- --runInBand
npm run test:e2e

cd ../frontend
npm ci
npm run build
npm test
```

Pull requests run lint, build, and unit tests for both packages, end-to-end tests against a real
PostgreSQL, a database backup/restore check, CodeQL analysis, and a dependency audit. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Map data

Map tiles are not included in this repository. Check the terms of the tile provider you intend to
use, including attribution and bulk-download rules. In particular, tiles from
`tile.openstreetmap.org` may not be bulk-downloaded for offline use.

## License

The source code is released under the [MIT License](LICENSE). Maps, PostgreSQL, and npm
dependencies carry their own terms — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
