## ADDED Requirements

### Requirement: Deploy command uses wrangler deploy
The deployment script SHALL use `wrangler deploy` instead of `wrangler pages deploy`.

#### Scenario: deploy script runs successfully
- **WHEN** running `pnpm deploy` in the frontend directory
- **THEN** it SHALL execute `astro build && wrangler deploy` and deploy the frontend as a Worker

#### Scenario: dev command remains unchanged
- **WHEN** running `pnpm dev`
- **THEN** it SHALL still start the local development server via `astro dev`

### Requirement: Build output compatibility
The Astro build output SHALL be compatible with Workers static assets serving.

#### Scenario: build produces static files in dist/
- **WHEN** running `astro build`
- **THEN** the output SHALL be placed in the `dist/` directory matching the `assets.directory` config in `wrangler.toml`

### Requirement: CI/CD pipeline uses Workers deployment
The CI/CD deployment pipeline SHALL use Workers deployment commands instead of Pages commands.

#### Scenario: CI deploys via wrangler deploy
- **WHEN** the CI pipeline runs deployment
- **THEN** it SHALL use `wrangler deploy` from the frontend directory, not `wrangler pages deploy`
