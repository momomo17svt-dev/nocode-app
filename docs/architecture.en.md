# Architecture

*[日本語版](architecture.md)*

## Overview

NoCode App is a business application platform aimed at LANs and fully offline networks. The same
project folder supports both a Docker deployment and a Docker-free Windows batch deployment.

## Components

| Layer | Technology |
| --- | --- |
| Frontend | React 19 / TypeScript / Vite / React Router / Tailwind CSS |
| Backend | Node.js 22 / NestJS 11 / REST |
| Database | PostgreSQL 16 / Prisma 7 |
| Storage | `storage/attachments` and `storage/tiles` on the filesystem |
| AI (optional) | LM Studio, Ollama, major cloud providers, or any OpenAI-compatible API |

In the Docker deployment, Nginx serves the SPA, `/api`, and `/tiles` from a single origin. The
batch deployment runs Vite on port 5173 and NestJS on 3001, and accepts only the local origins
listed in `CORS_ORIGINS`.

## Where the interesting logic lives

| Path | Responsibility |
| --- | --- |
| `backend/src/records/compute.util.ts` | Formula evaluator (recursive descent — no `eval`) |
| `frontend/src/lib/calc.ts` | The same evaluator on the client, for live preview |
| `backend/src/apps/templates.ts` | The 33 built-in app templates |
| `backend/src/common/app-definition.util.ts` | Validates and normalises any app definition, including LLM output |
| `backend/src/llm/llm.service.ts` | The single gateway to every LLM provider |

> [!IMPORTANT]
> The two formula evaluators must stay behaviourally identical. A change to one requires the same
> change to the other; `templates.spec.ts` and the calc tests guard the shared surface.

## Authentication and hardening

On successful login the JWT is written to an HttpOnly, SameSite cookie, and a separate readable
cookie carries a CSRF token. The frontend attaches the CSRF header to every mutating request.
Bearer authentication is also accepted for external integrations and tests, but returning a bearer
token in the login response is disabled by default (`AUTH_EXPOSE_BEARER_TOKEN`).

Nginx and the API set CSP, clickjacking, and MIME-sniffing headers. Uploads are received in memory
and are written to disk under a UUID filename **only after** authorisation and content inspection
have both passed.

Record updates carry an `expectedVersion` and are rejected on mismatch, so two people editing from
the same stale screen cannot silently overwrite each other.

## Permissions

Three layers compose:

1. **App permissions** — view / add / edit / delete / manage, granted to users or departments
2. **Record scope** — `all`, `owner` (own records only), or `org` (own department and its children)
3. **Target-employee field** — an optional per-app filter that further narrows records to those
   whose designated employee is inside the viewer's department subtree

Users with manage rights bypass 2 and 3. See the [permission model](permission-design.md) for the
full matrix.

## Data access

The list tab resolves permission scope, search, conditions, sorting, and pagination in PostgreSQL.
The audit log is paged 50 rows at a time using a composite index on creation time and id. Indexes
cover app id, created/updated timestamps, creator, and the JSONB payload. The frontend adds a
short-lived GET cache and deduplicates concurrent identical requests, and every screen is
lazy-loaded.

The board, calendar, map, progress, and chart tabs fetch the whole result set rather than paging.
For very large apps, narrow them with a saved view first.

## AI integration

One client covers the OpenAI-compatible models, chat, streaming, and embeddings endpoints. LM
Studio and Ollama connect locally; OpenAI, OpenRouter, Groq, Gemini, and Mistral are presets;
anything else uses a custom base URL. API keys live in the server-side settings table, and the
frontend is told only whether a key is registered. LM Studio's model load/unload controls appear
only when LM Studio is selected.

## Observability

The API emits JSON logs with a request id, route, status code, and duration. By default it records
slow or failed requests; `HTTP_LOG_MODE=all` records everything. SQL statements exceeding
`DB_SLOW_QUERY_MS` are logged as warnings.

## Offline requirements

Every library needed to render the UI is bundled into the build. Online maps and AI are optional
features — with locally cached map tiles and AI disabled, the system runs with no outbound traffic
at all.
