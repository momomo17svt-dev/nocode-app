<div align="center">

# NoCode App

**A self-hosted business application platform that runs on a LAN — including fully offline networks**

Forms, views, permissions, workflow, dashboards, audit logs, and optional LLM integration — without writing code.

[![CI](https://github.com/momomo17svt-dev/nocode-app/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/momomo17svt-dev/nocode-app/actions/workflows/ci.yml)
[![CodeQL](https://github.com/momomo17svt-dev/nocode-app/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/momomo17svt-dev/nocode-app/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 22](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)](.nvmrc)
[![PostgreSQL 16+](https://img.shields.io/badge/PostgreSQL-16%2B-4169E1?logo=postgresql&logoColor=white)](docs/setup-guide.md)

[日本語](README.md) ・ [Setup](docs/setup-guide.md) ・ [Screens](#screens) ・ [Documentation](#documentation) ・ [Changelog](CHANGELOG.md) ・ [Contributing](CONTRIBUTING.md)

<br>

<img src="docs/assets/dashboard.png" alt="An inquiry-tracking dashboard with KPI tiles, a bar chart, and a pie chart" width="100%">

</div>

---

Run your internal business apps on your own server instead of handing them to an external SaaS.
It starts on a single machine with Docker, even on a network with no route to the internet.

> [!IMPORTANT]
> This is `v0.1.0` and still being prepared for release. Before exposing it directly to the
> internet, read [SECURITY.md](SECURITY.md) and the [known issues](docs/known-issues.md).

## What it does

| | |
| --- | --- |
| 🧩 **Build apps** | Arrange 22 field types to get a form, a list, and a detail screen. Start from 33 business templates or a linked CRM app suite |
| 📊 **Six ways to look at data** | List, board, calendar, map, progress, and chart. Filters and sort order can be saved as views and shared with your team |
| 🧮 **Calculations** | Arithmetic, conditional rule tables, and subtable aggregation (`sum`, `avg`, `count`) — all configured, not coded |
| 🔐 **Permissions** | Department trees, record visibility scopes (everyone / own records / own department), and a target-employee field filter |
| 🔁 **Workflow** | Status transitions with a named approver and send-back paths. Only the designated approver can approve |
| 📈 **Dashboards** | KPI, chart, list, map, and my-tasks widgets, each with its own sharing scope |
| 🗂 **Audit and recovery** | Audit log of every operation, record restore within 30 days of deletion, and optimistic locking on updates |
| 🤖 **AI (optional)** | Works with a local LLM (LM Studio, Ollama) or any cloud OpenAI-compatible API. Data access is off by default |
| 🌐 **Bilingual UI** | Switch between Japanese and English. Dates, times, and numbers follow the selected language |
| 📡 **Offline first** | No outbound traffic required. Maps work offline once tiles are cached locally |

## Screens

From picking a template to a record list, a board, a chart, and a dashboard — without writing a
line of code (29 seconds). The interface ships in Japanese and English; these are from the
Japanese UI.

<div align="center">
  <img src="docs/assets/demo.gif" alt="Choosing a template, creating an app, and browsing its list, board, chart, and dashboard" width="100%">
</div>

<table>
<tr>
<td width="50%">
<img src="docs/assets/record-list.png" alt="Record list of an inventory app">
<sub><b>Record list</b> — list, board, calendar, progress, and chart tabs. The "在庫金額" (stock value) column is a calculated field: unit price × quantity.</sub>
</td>
<td width="50%">
<img src="docs/assets/board.png" alt="Board view of a task app">
<sub><b>Board</b> — group by any choice field and drag a card to change its value.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/assets/form-builder.png" alt="Form builder in the app settings screen">
<sub><b>Form builder</b> — add any of 22 field types from the left and reorder them to shape the form.</sub>
</td>
<td width="50%">
<img src="docs/assets/templates.png" alt="Template picker dialog">
<sub><b>Templates</b> — start from 33 business templates or a four-app CRM suite.</sub>
</td>
</tr>
</table>

## Quick start

### Docker (any OS, recommended)

With Docker and the Compose plugin, you need neither Node.js nor PostgreSQL on the host.

```bash
cp .env.example .env
```

Replace all three `change_me` values in `.env` (`POSTGRES_PASSWORD`, `JWT_SECRET`,
`INITIAL_ADMIN_PASSWORD`). `openssl rand -hex 32` produces a suitable secret.

```bash
docker compose up -d --build
```

Open <http://localhost:5173> and sign in as `admin` with the password you set. Stop with
`docker compose down`; follow logs with `docker compose logs -f backend`.

Full details, including running behind HTTPS, are in the [setup guide](docs/setup-guide.en.md).

### Windows shortcut

On Windows the batch scripts generate the secrets for you, so you never edit `.env` by hand:

```text
start_docker.bat
```

The administrator login and password are printed **once** — save them right away.
`stop_docker.bat` and `logs_docker.bat` stop the stack and tail its logs.

### Windows without Docker

PostgreSQL is **not** bundled with this repository. Install PostgreSQL 16+, or download the
portable Windows binaries and extract them to `pgsql/` so that `pgsql\bin\postgres.exe` exists.
If PostgreSQL lives elsewhere, set `NOCODEAPP_PG_HOME` to its root directory.

```text
setup.bat
start_server.bat
```

`setup.bat` generates the environment and initial administrator, runs migrations, and builds.

> [!NOTE]
> The Docker and batch setups both use port 5173, so do not run them at the same time. The
> PostgreSQL instance `setup.bat` creates uses `trust` authentication for local connections — if
> other people share the machine, use the Docker path instead.

### Requirements

| | |
| --- | --- |
| Node.js | 22 or later |
| PostgreSQL | 16 or later |
| Docker | only for the Docker setup |

## Stack

| Layer | Components |
| --- | --- |
| Backend | NestJS 11 / Prisma 7 / PostgreSQL / JWT in an HttpOnly cookie |
| Frontend | React 19 / TypeScript / Vite / Tailwind CSS |
| Storage | Local attachments, optional offline map tiles |
| AI (optional) | LM Studio, Ollama, OpenAI, OpenRouter, Groq, Gemini, Mistral, or any OpenAI-compatible API |

## AI integration (optional)

An administrator configures the provider, base URL, chat model, and embedding model. API keys can
be stored for cloud providers but are never returned to the UI or the settings API. AI search
additionally requires the endpoint to support an embeddings API.

<details>
<summary><b>What the assistant can see</b> — nothing, by default</summary>

<br>

The assistant starts with **no data access**. Before asking a question you explicitly choose the
scope:

| Scope | Behaviour |
| --- | --- |
| No reference (plain chat) | Uses the chat model only |
| App data only | Searches every app you can read, or one selected app |
| Knowledge only | Searches every document you can read, or one selected document |
| App data + knowledge | Searches both |

Changing the scope starts a new conversation so earlier sources do not leak into later answers.
The three search modes require an embedding model. When too little relevant material is found, the
assistant does not guess — it suggests widening the scope or rephrasing the question.

</details>

<details>
<summary><b>Knowledge visibility</b> — scoped by department</summary>

<br>

Knowledge documents are published either company-wide or to selected departments, optionally
including sub-departments. Document lists, document bodies, and AI search all apply the same
department rules, so documents you cannot read never become the basis for an answer.

Documents that older versions tied to app permissions stay protected under a legacy scope until an
administrator edits them and moves them to a company-wide or department scope.

</details>

## Administration

The system settings screen manages the following without touching a config file:

- Login attempt limits, lockout duration, session lifetime, and minimum password length
- Scheduled database backups, manual runs, and download of retained generations
- Issuing and revoking API tokens for external integrations
- Restoring or permanently deleting records within 30 days of deletion

Deactivating a user and changing a role or password take effect on existing sessions immediately.
Record updates are version-checked, so two people editing from the same stale screen cannot
silently overwrite each other. For integrations, see the
[API integration guide](docs/api-integration.md).

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

## Language

Japanese and English can be switched from the header or the login screen. The choice is stored
per browser. Dates, times, and numbers follow the selected language. Business data entered into
your apps is never machine-translated.

When you add or change UI text, run `npm run i18n:audit` in `frontend/` to find Japanese strings
that have no English translation. CI runs the same check.

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

## Documentation

The two documents you need to run or modify the project are in English. The rest are Japanese —
translations are welcome, and each one is a well-scoped first contribution.

| Document | Contents |
| --- | --- |
| **[Setup guide](docs/setup-guide.en.md)** 🇬🇧 | Docker on any OS, the Windows batch path, backups |
| **[Architecture](docs/architecture.en.md)** 🇬🇧 | Structure, where the interesting logic lives, auth, permissions |
| [Docker guide](docs/docker-guide.md) | Starting, stopping, and troubleshooting the Docker stack |
| [Backup and restore](docs/backup-restore-guide.md) | Scheduled and manual backups, verifying a restore |
| [Offline migration](docs/offline-migration.md) | Moving production data to another PC |
| [API integration](docs/api-integration.md) | Integration tokens and endpoints |
| [Database design](docs/db-design.md) | Tables and indexes |
| [Permission model](docs/permission-design.md) | App permissions, record scopes, department trees |
| [Security review](docs/security-review.md) | Authentication, CSRF, uploads, headers |
| [Known issues](docs/known-issues.md) | Unsupported behaviour and workarounds |
| **[Roadmap](docs/roadmap.en.md)** 🇬🇧 | What is planned, what is being considered, what will not be built |
| [Test plan](docs/test-plan.md) | Coverage and automated test layout |
| [Walkthrough](docs/walkthrough.md) | How to read the main code paths |

## Map data

Map tiles are not included in this repository. Check the terms of the tile provider you intend to
use, including attribution and bulk-download rules. In particular, tiles from
`tile.openstreetmap.org` may not be bulk-downloaded for offline use.

## Contributing and security

- See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
  for expected conduct.
- Report vulnerabilities through the process in [SECURITY.md](SECURITY.md), not a public issue.

## License

The source code is released under the [MIT License](LICENSE). Maps, PostgreSQL, and npm
dependencies carry their own terms — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
