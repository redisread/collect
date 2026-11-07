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
api/          Hono API, D1 schema/migrations, auth, feed sync, routes
frontend/     Astro Web app, React islands, unified Worker entry/config
mobile/       Flutter app
packages/     shared types/config packages
.github/      CI and deploy workflows
```

## Current Stack

- Root: pnpm workspace, Node >= 22.13, pnpm >= 11.24
- API: Hono, Cloudflare Workers, D1, KV, R2, Drizzle ORM, Better Auth, Vitest
- Frontend: Astro 7, `@astrojs/cloudflare`, React 19, Tailwind CSS 4, Workers Static Assets
- Mobile: Flutter 3 stable, Riverpod, go_router

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
```

Frontend:

```bash
pnpm --filter frontend dev
pnpm --filter frontend build
pnpm --filter frontend type-check
pnpm --filter frontend deploy:dry-run
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

Unified Worker:

- Worker name: `collect`
- Config: `frontend/wrangler.jsonc` (the deployment source of truth)
- Entrypoint: `frontend/src/worker.ts`
- `/api/*`: Hono app imported from `api/src/app.ts`
- Other routes: Astro SSR/SSG, React Islands and Static Assets
- Bindings: `DB`, `COLLECT_KV`, `SESSION`, `COLLECT_R2`, `FEED_SYNC_QUEUE`, `ASSETS`
- Cron: Feed Queue dispatch every five minutes; digest scan hourly
- No Durable Objects or Workflows until a concrete realtime/strong-consistency or multi-step durable requirement exists

CI:

- PRs and pushes to `main` run `.github/workflows/cloudflare.yml`
- Only pushes to `main` deploy, after API/Web checks, tests, build and Wrangler dry-run pass
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
- Browser API clients must use same-origin `/api/*`; do not add a public API base URL or credentialed wildcard CORS.
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

- Keep changes scoped; Web and API share one Worker deployment while mobile remains independent.
- Do not commit secrets, Wrangler credentials, production tokens, or local `.dev.vars` values.
- Do not run production D1 migrations or deploys without explicit human approval.
- Avoid broad refactors while fixing product bugs; prefer small PRs with clear validation.
- If worktree has unrelated changes, preserve them and mention them in the handoff.
- When docs conflict with code, inspect `package.json`, Wrangler config, Astro config, and workflows; then update stale docs separately.

## Known Gotchas

- First production cutover requires explicit creation of `collect-feed-sync` and its DLQ plus required secrets on Worker `collect`.
- There are duplicate-looking migration names (`0000_*`, `0001_*`, `0002_*`). Check `_journal.json` and current D1 state before creating or applying new migrations.
- The pnpm workspace pins Picomatch 4.x to one version because duplicate CommonJS copies can escape the Cloudflare Vite plugin optimizer and fail inside workerd.
