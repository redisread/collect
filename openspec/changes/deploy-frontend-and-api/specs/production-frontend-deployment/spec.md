## ADDED Requirements

### Requirement: Frontend deployed to Workers
The frontend SHALL be deployed as a Cloudflare Worker with static assets.

#### Scenario: deploy script executes successfully
- **WHEN** running `pnpm --filter frontend deploy`
- **THEN** the frontend SHALL deploy as a Worker with static assets serving

### Requirement: Frontend production bindings are correct
The frontend Worker SHALL have correct production bindings for SESSION KV and ASSETS.

#### Scenario: SESSION KV binding uses production namespace
- **WHEN** the frontend Worker starts
- **THEN** it SHALL have access to the production KV namespace via the SESSION binding
