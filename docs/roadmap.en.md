# Roadmap

*[日本語版](roadmap.md)*

[Known issues](known-issues.md) lists what the project cannot do today. This page lists what it
intends to do. There are no dates — only the ordering is meaningful: items higher up matter more.

The letter after each item is a rough size, for anyone deciding what to pick up.

- **S** — one or two files, with existing tests to copy from
- **M** — touches several layers, but the design decision is already made
- **L** — needs design work first

Items with an open issue are [on the tracker](https://github.com/momomo17svt-dev/nocode-app/issues).
Start with anything labelled `good first issue`.

## Next up

### Making the project easier to contribute to

- [ ] Translate the remaining Japanese documents (14 files under `docs/`) — **S**
- [ ] Record a verified end-to-end `docker compose` run on Linux and macOS — **S**

### Calculations and filtering

- [ ] Date arithmetic (`days(end, start)` and similar). The incident-management MTTR field is
      blocked on this — **M**
- [ ] Compare one field against another in saved-view filters. Rule tables already support this
      through `valueField` — **M**
- [ ] OR conditions and condition groups in saved views (currently AND-only) — **M**

### Views

- [ ] Line charts in the aggregation tab — **S**
- [ ] Cross-tabulation (two axes) — **M**
- [ ] Period comparison (month over month, year over year) — **M**
- [ ] Server-side pagination for the board, calendar, map, progress, and chart tabs. They currently
      fetch the whole result set — **L**

### Fields and process

- [ ] Multi-select for user and group fields — **M**
- [ ] Conditional branching in workflows (route by amount, for example) — **L**
- [ ] Parallel approval routes — **L**

### Operations

- [ ] Move the anonymous-form rate limit into a shared store (Redis or similar) so more than one
      backend can run — **M**
- [ ] An alternative to scanning JSONB. A dedicated search column or full-text index for
      million-row deployments — **L**

## Under consideration (not committed)

- A worked-through mobile layout. The UI currently assumes a desktop
- Antivirus scanning for attachments
- SSO (OIDC / SAML)
- Record versioning with a diff view

## Explicit non-goals

These are settled decisions. Proposals are welcome, but they need an argument strong enough to
overturn the reasoning.

- **Multi-tenant SaaS.** One organisation per instance is baked into the permission model and the
  backup design; removing that assumption means rewriting both
- **Features that assume a live internet connection.** Running inside a closed network is the
  reason this project exists
- **Requiring a cloud LLM.** AI stays optional, and everything must remain reachable with a local
  model alone
