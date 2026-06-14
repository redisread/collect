# CLAUDE.md

This repository is the **Collect RSS Reader** monorepo. Keep this file short and operational; move long product specs, endpoint catalogs, or UI notes into normal docs.

## Product

Collect is a modern RSS reader with:

- RSS/Atom/JSON Feed subscription management
- article extraction via Readability-style parsing
- folders, smart folders, read/star/read-later states
- OPML import/export
- translation support
- Web + mobile clients backed by a Cloudflare API

Note: the directory may be named `folio`, but the app/package/product name is `collect`.

## Repo Layout

```text
api/          Hono API Worker, D1 schema/migrations, auth, feed sync, routes
frontend/     Astro server-rendered Web app with React islands
mobile/       Flutter app
packages/     shared types/config packages
.github/      CI and deploy workflows
```

## Current Stack

- Root: pnpm workspace, Node >= 20, pnpm >= 9
- API: Hono, Cloudflare Workers, D1, KV, R2, Drizzle ORM, Better Auth, Vitest
- Frontend: Astro 5.7, `@astrojs/cloudflare`, React 19, Tailwind CSS 4, Cloudflare Pages
- Mobile: Flutter 3 stable, Riverpod, go_router

README may mention Astro 6; trust `frontend/package.json` and `frontend/astro.config.mjs` unless you are explicitly updating the frontend.

## Commands

Run from repo root unless noted.

```bash
pnpm install
pnpm dev
pnpm dev:api
pnpm dev:frontend
pnpm build
pnpm lint
pnpm type-check
```

API:

```bash
pnpm --filter api dev
pnpm --filter api build
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api db:generate
pnpm --filter api db:migrate:local
pnpm --filter api deploy
```

Frontend:

```bash
pnpm --filter frontend dev
pnpm --filter frontend build
pnpm --filter frontend type-check
pnpm --filter frontend deploy
```

Mobile:

```bash
cd mobile && flutter pub get
cd mobile && flutter analyze
cd mobile && flutter test
cd mobile && flutter run
```

## Cloudflare Deployment

API:

- Worker name: `collect-api`
- Config: `api/wrangler.toml`
- Entrypoint: `api/src/index.ts`
- D1 binding: `DB`, database `collect-db`
- KV binding: `COLLECT_KV`
- R2 binding: `COLLECT_R2`
- Cron: hourly feed/digest work via `api/src/cron/handlers.ts`

Frontend:

- Pages project: `collect-frontend`
- Config: `frontend/wrangler.toml`
- Build output: `frontend/dist`
- Astro output: `server`
- `PUBLIC_API_URL` is supplied by CI secret `API_URL`

CI:

- `api/**` changes trigger `.github/workflows/api.yml`
- `frontend/**` or `packages/**` changes trigger `.github/workflows/frontend.yml`
- PRs to `main` run `.github/workflows/lint.yml`
- `mobile/**` changes trigger `.github/workflows/mobile.yml`

## API Rules

- Route files live in `api/src/routes/`.
- Auth is Better Auth; check `api/src/lib/auth.ts` and `api/src/middleware/auth.ts` before changing session behavior.
- Database schema lives in `api/src/db/schema.ts`; migrations live in `api/drizzle/migrations/`.
- Generate migrations with Drizzle instead of hand-editing snapshots.
- Prefer typed Drizzle queries and Zod validation over ad hoc request parsing.
- Feed parsing, extraction, translation, and scheduled sync can touch external URLs; add focused tests for parser edge cases.

## Frontend Rules

- Frontend runs through Astro with Cloudflare adapter and React islands.
- Keep server-rendered pages in `frontend/src/pages/`; client state belongs in small React components.
- Global styles are in `frontend/src/styles/global.css`.
- API clients should use `PUBLIC_API_URL`; do not hardcode production API URLs in components.
- After UI changes, verify desktop and mobile widths and check for hydration warnings.

## Mobile Rules

- Keep API models in sync with `packages/types` where applicable.
- Run `flutter analyze` and focused widget/unit tests for mobile changes.
- Pass API base URL via build-time config for release builds; do not hardcode local endpoints.

## Verification Matrix

Use the narrowest checks that cover your change:

- API route/schema/parser: `pnpm --filter api test`, `pnpm --filter api lint`
- D1 migration: `pnpm --filter api db:migrate:local`, plus a targeted API smoke test
- Frontend UI/page: `pnpm --filter frontend type-check`, `pnpm --filter frontend build`, browser smoke test
- Shared package: root `pnpm build` or the affected consumers
- Mobile: `flutter analyze`, `flutter test`

Before PR handoff, report exactly which checks ran and which were skipped.

## Engineering Rules

- Keep changes scoped; this is a monorepo with independent API, Web, and mobile deploys.
- Do not commit secrets, Wrangler credentials, production tokens, or local `.dev.vars` values.
- Do not run production D1 migrations or deploys without explicit human approval.
- Avoid broad refactors while fixing product bugs; prefer small PRs with clear validation.
- If worktree has unrelated changes, preserve them and mention them in the handoff.
- When docs conflict with code, inspect `package.json`, Wrangler config, Astro config, and workflows; then update stale docs separately.

## Known Gotchas

- `api/wrangler.toml` currently has placeholder-looking local resource IDs (`local-collect-db`, `local-collect-kv`). Confirm real Cloudflare resource config before production deploy work.
- There are duplicate-looking migration names (`0000_*`, `0001_*`, `0002_*`). Check `_journal.json` and current D1 state before creating or applying new migrations.
- README says Astro 6, but `frontend/package.json` currently pins Astro 5.7. Do not assume an upgrade happened unless package files changed.
