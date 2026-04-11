#!/bin/bash

# Generate OpenAPI spec from shared schemas
echo "📦 Generating OpenAPI spec..."
cd packages/shared
pnpm build
pnpm generate:openapi ../../openapi.json
cd ../..

# Generate TypeScript client (optional)
# npx openapi-typescript openapi.json --output frontend/src/lib/api-types.ts

echo "✅ Code generation complete!"
