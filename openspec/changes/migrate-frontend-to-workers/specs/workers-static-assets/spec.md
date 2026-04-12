## ADDED Requirements

### Requirement: Workers static assets configuration
The frontend project SHALL be configured as a Cloudflare Worker with static assets, replacing the Pages deployment model.

#### Scenario: wrangler.toml uses assets field
- **WHEN** reading `wrangler.toml`
- **THEN** the config SHALL contain an `assets` block with `directory` set to the build output path (`dist`) instead of `pages_build_output_dir`

#### Scenario: assets binding is defined
- **WHEN** the worker runs
- **THEN** it SHALL have access to static assets via an `ASSETS` binding defined in `wrangler.toml`

### Requirement: SPA routing support
The static assets configuration SHALL support single-page application routing, ensuring client-side routes are handled correctly.

#### Scenario: not_found_handling is configured
- **WHEN** a request does not match any static file
- **THEN** the system SHALL serve the SPA entry point according to the `not_found_handling` setting in the assets config

### Requirement: Development files are excluded from upload
The build output SHALL exclude development files (node_modules, source maps, etc.) from the uploaded assets.

#### Scenario: .assetsignore file exists
- **WHEN** assets are uploaded
- **THEN** files matching patterns in `.assetsignore` SHALL be excluded from the upload

### Requirement: Worker-first execution
The worker script SHALL execute before static asset serving when needed, enabling middleware-like behavior.

#### Scenario: run_worker_first is configurable
- **WHEN** certain routes need worker handling before asset serving
- **THEN** the `run_worker_first` setting SHALL control which requests are handled by the worker first
