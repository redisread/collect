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
mobile/       Native iPhone app (SwiftUI + SwiftData), Widget extension
packages/     shared types/config packages
.github/      CI and deploy workflows
```

## Current Stack

- Root: pnpm workspace, Node >= 22.13, pnpm >= 11.24
- API: Hono, Cloudflare Workers, D1, KV, R2, Drizzle ORM, Better Auth, Vitest
- Frontend: Astro 7, `@astrojs/cloudflare`, React 19, Tailwind CSS 4, Workers Static Assets
- Mobile: Swift 6.4, SwiftUI, SwiftData, WidgetKit; iPhone with iOS 26+, dark appearance

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
xcodebuild -project mobile/Collect.xcodeproj -scheme Collect -sdk iphonesimulator CODE_SIGN_IDENTITY=- build
# Use an installed iPhone simulator ID from xcrun simctl list devices available
xcodebuild -project mobile/Collect.xcodeproj -scheme Collect -destination "platform=iOS Simulator,id=<ID>" CODE_SIGN_IDENTITY=- test
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
- GitHub Actions runs checks, tests, build validation and Wrangler dry-run. Cloudflare Workers Builds deploys pushes to `main` from `redisread/collect` using root `frontend`, build `pnpm build` and deploy `pnpm exec wrangler deploy`.
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
- Use SwiftUI and Apple system frameworks, with Swift 6 strict concurrency. Keep code organized by feature.
- Use Swift Testing for unit/integration tests and XCTest for UI tests. Build the app and Widget together.
- UI is iPhone-only, iOS 26+, dark/OLED. No UIKit imports or external Swift packages.
- Read `docs/ios-native-design.md` for offline, synchronization, and reader behavior.
- Configure `COLLECT_API_URL` and `COLLECT_APP_GROUP` at build time. Real-device distribution also requires the team, bundle IDs, and App Group entitlement.
- `mobile/project.yml` is the XcodeGen source. Regenerate and commit `Collect.xcodeproj` after target/file changes.

## Verification Matrix

Use the narrowest checks that cover your change:

- API route/schema/parser: `pnpm --filter api test`, `pnpm --filter api lint`
- D1 migration: `pnpm --filter api db:migrate:local`, plus a targeted API smoke test
- Frontend UI/page: `pnpm --filter frontend type-check`, `pnpm --filter frontend build`, browser smoke test
- Shared package: root `pnpm build` or the affected consumers
- Mobile: iOS simulator build, Swift Testing and XCTest, focused iPhone runtime verification

Before PR handoff, report exactly which checks ran and which were skipped.

## Engineering Rules

- For PR review and merge decisions, follow [AGENTS.md](AGENTS.md).
- Keep changes scoped; Web and API share one Worker deployment while mobile remains independent.
- Do not commit secrets, Wrangler credentials, production tokens, or local `.dev.vars` values.
- Production D1 migrations and direct deployments require user authorization. Automatic deployment triggered by a PR merge follows the authorization in [AGENTS.md](AGENTS.md).
- Avoid broad refactors while fixing product bugs; prefer small PRs with clear validation.
- If worktree has unrelated changes, preserve them and mention them in the handoff.
- When docs conflict with code, inspect `package.json`, Wrangler config, Astro config, and workflows; then update stale docs separately.

## Known Gotchas

- First production cutover requires explicit creation of `collect-feed-sync` and its DLQ plus required secrets on Worker `collect`.
- There are duplicate-looking migration names (`0000_*`, `0001_*`, `0002_*`). Check `_journal.json` and current D1 state before creating or applying new migrations.
- The pnpm workspace pins Picomatch 4.x to one version because duplicate CommonJS copies can escape the Cloudflare Vite plugin optimizer and fail inside workerd.
