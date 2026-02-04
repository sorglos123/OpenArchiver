# Quick Development Reference

Quick reference for common development tasks on the OAuth2 branch.

## Starting Development Environment

```bash
# 1. Start infrastructure services
docker compose -f docker-compose.dev.yml up -d

# 2. Install dependencies (first time only)
pnpm install

# 3. Run migrations (first time or after schema changes)
pnpm db:migrate:dev

# 4. Start all dev servers (backend + frontend + workers)
pnpm dev:oss
```

## Accessing Services

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:4000 |
| Meilisearch | http://localhost:7700 |
| PostgreSQL | localhost:5432 |
| Redis (Valkey) | localhost:6379 |

## Common Commands

```bash
# Format code
pnpm format

# Check code style
pnpm lint

# Build all packages
pnpm build

# Build types only
pnpm --filter @open-archiver/types build

# Backend dev (watch mode)
pnpm --filter @open-archiver/backend dev

# Frontend dev (with hot reload)
pnpm --filter @open-archiver/frontend dev

# Run workers in dev mode
pnpm start:workers:dev

# Generate new migration
pnpm db:generate

# Run migrations
pnpm db:migrate:dev
```

## Database Operations

```bash
# Access PostgreSQL
docker exec -it postgres-dev psql -U admin -d open_archive

# Check OAuth tokens
SELECT id, provider, email, expires_at FROM oauth_tokens;

# Reset database (WARNING: deletes all data)
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate:dev
```

## Testing OAuth2

**No Azure Portal setup required!** OAuth2 works out of the box using Microsoft's public client.

1. **Test in UI**:
   - Settings → OAuth Accounts → Sign in with Microsoft
   - Archive → Ingestions → Add Generic IMAP with OAuth2

2. **Optional: Custom Azure app** (for organizations):
   ```bash
   # Add to .env only if you need a custom application
   MS_CLIENT_ID=your-client-id
   MS_REDIRECT_URI=http://localhost:4000/api/v1/auth/outlook/callback
   ```
   - Register at https://portal.azure.com/
   - Add redirect URI: `http://localhost:4000/api/v1/auth/outlook/callback`
   - Copy Client ID to `.env`

## Troubleshooting

```bash
# Clear pnpm cache
pnpm store prune

# Restart infrastructure
docker compose -f docker-compose.dev.yml restart

# View backend logs (if in Docker)
docker compose -f docker-compose.dev.yml logs -f postgres

# Check port usage
lsof -ti:4000  # Backend port
lsof -ti:3000  # Frontend port

# Kill process on port
lsof -ti:4000 | xargs kill -9
```

## File Structure (OAuth2)

```
packages/
  backend/src/
    api/
      controllers/oauth.controller.ts    # OAuth API endpoints
      routes/oauth.routes.ts              # OAuth routes
    services/
      OAuthService.ts                     # OAuth logic
      ingestion-connectors/
        ImapConnector.ts                  # XOAUTH2 support
    database/
      schema/oauth-tokens.ts              # Token schema
      migrations/0024_oauth_tokens.sql    # Migration
  
  frontend/src/
    routes/dashboard/settings/
      oauth-accounts/+page.svelte         # OAuth UI
  
  types/src/
    oauth.types.ts                        # TypeScript types
    ingestion.types.ts                    # Updated for OAuth
```

## Environment Variables (OAuth2)

OAuth2 works with default settings (public client). Optional for custom applications:

```bash
MS_CLIENT_ID=               # Optional: Custom Azure app client ID (uses public client if not set)
MS_REDIRECT_URI=            # Optional: Custom callback URL (auto-generated if not set)
ENCRYPTION_KEY=             # Required: 32-byte hex (openssl rand -hex 32)
```

Default behavior:
- Uses Microsoft's public OAuth client (9e5f94bc-e8a4-4e73-b8be-63364c29d753)
- Auto-generates redirect URI from APP_URL
- No Azure Portal registration needed

## Resources

- [Full Dev Setup Guide](./DEV_SETUP.md)
- [OAuth2 User Documentation](./docs/user-guides/email-providers/oauth2.md)
- [Contributing Guidelines](./CONTRIBUTING.md)
