## ADDED Requirements

### Requirement: API uses production D1 database
The API Worker SHALL bind to the production D1 database instance for data persistence.

#### Scenario: wrangler.toml has correct D1 database_id
- **WHEN** reading `api/wrangler.toml`
- **THEN** the `d1_databases` section SHALL contain the production `database_id` (not the local placeholder)

### Requirement: API uses production KV namespace
The API Worker SHALL bind to the production KV namespace for caching.

#### Scenario: wrangler.toml has correct KV namespace id
- **WHEN** reading `api/wrangler.toml`
- **THEN** the `kv_namespaces` section SHALL contain the production namespace `id` (not the local placeholder)

### Requirement: API uses production R2 bucket
The API Worker SHALL bind to the production R2 bucket for file storage.

#### Scenario: wrangler.toml has correct R2 bucket name
- **WHEN** reading `api/wrangler.toml`
- **THEN** the `r2_buckets` section SHALL contain the production bucket name
