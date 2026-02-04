# Development Environment Setup Guide - OAuth2 Branch

This guide explains how to set up and test the OAuth2 integration feature in your local development environment.

## Quick Answer

**Do you need to build Docker containers?**
- ❌ **No** - You can run the development environment **without Docker** using the built-in dev scripts
- ⚠️ **Yes (if using Docker)** - If you prefer Docker, you'll need to rebuild the image locally since the pre-built image doesn't include the OAuth2 changes

**Recommended approach for testing this branch: Run locally without Docker** (faster iteration, easier debugging)

---

## Prerequisites

- **Node.js**: v22.0.0 or higher (check: `node --version`)
- **pnpm**: v10.13.1 (check: `pnpm --version`)
- **PostgreSQL**: Running instance (can use Docker for this)
- **Redis/Valkey**: Running instance (can use Docker for this)
- **Meilisearch**: Running instance (can use Docker for this)

---

## Option 1: Local Development (Recommended) ⚡

This approach runs the backend and frontend locally without Docker, allowing for faster development and testing.

### Step 1: Clone and Switch to Branch

```bash
git clone https://github.com/sorglos123/OpenArchiver.git
cd OpenArchiver
git checkout copilot/add-oauth2-integration
```

### Step 2: Install Dependencies

```bash
# Install pnpm if you don't have it
npm install -g pnpm@10.13.1

# Install all dependencies
pnpm install
```

### Step 3: Set Up Infrastructure Services (Docker)

While we're running the app locally, we still need PostgreSQL, Redis, and Meilisearch. Use this minimal docker-compose:

Create a file `docker-compose.dev.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:17-alpine
    container_name: postgres-dev
    ports:
      - '5432:5432'
    environment:
      POSTGRES_DB: open_archive
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: password
    volumes:
      - pgdata-dev:/var/lib/postgresql/data

  valkey:
    image: valkey/valkey:8-alpine
    container_name: valkey-dev
    ports:
      - '6379:6379'
    command: valkey-server --requirepass defaultredispassword
    volumes:
      - valkeydata-dev:/data

  meilisearch:
    image: getmeili/meilisearch:v1.15
    container_name: meilisearch-dev
    ports:
      - '7700:7700'
    environment:
      MEILI_MASTER_KEY: aSampleMasterKey
    volumes:
      - meilidata-dev:/meili_data

  tika:
    image: apache/tika:3.2.2.0-full
    container_name: tika-dev
    ports:
      - '9998:9998'

volumes:
  pgdata-dev:
  valkeydata-dev:
  meilidata-dev:
```

Start the services:

```bash
docker compose -f docker-compose.dev.yml up -d
```

### Step 4: Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and update these critical values:

```bash
# Database - point to local Docker Postgres
DATABASE_URL="postgresql://admin:password@localhost:5432/open_archive"

# Redis - point to local Docker Valkey
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=defaultredispassword
REDIS_TLS_ENABLED=false

# Meilisearch - point to local Docker
MEILI_HOST=http://localhost:7700
MEILI_MASTER_KEY=aSampleMasterKey

# Tika - point to local Docker
TIKA_URL=http://localhost:9998

# OAuth2 Configuration (OPTIONAL - uses public client by default)
# Open Archiver uses Microsoft's public OAuth client (same as Thunderbird).
# You only need to set these if you want to use a custom Azure application:
# MS_CLIENT_ID=your-custom-client-id
# MS_REDIRECT_URI=http://localhost:4000/api/v1/auth/outlook/callback

# Storage
STORAGE_LOCAL_ROOT_PATH=/tmp/open-archiver-dev

# JWT
JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRES_IN=7d

# Encryption (for OAuth tokens)
ENCRYPTION_KEY=your-32-byte-hex-encryption-key-here
```

**Generate encryption key:**
```bash
openssl rand -hex 32
```

### Step 5: Run Database Migrations

```bash
pnpm db:migrate:dev
```

This will create all tables including the new `oauth_tokens` table.

### Step 6: Start Development Servers

Open **three separate terminals**:

**Terminal 1 - Backend:**
```bash
pnpm --filter @open-archiver/backend dev
```

**Terminal 2 - Frontend:**
```bash
pnpm --filter @open-archiver/frontend dev
```

**Terminal 3 - Workers:**
```bash
pnpm start:workers:dev
```

Or use the all-in-one command:
```bash
pnpm dev:oss
```

### Step 7: Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **API Health Check**: http://localhost:4000

### Step 8: Test OAuth2 Integration

OAuth2 works out of the box using Microsoft's public client (same as Thunderbird). No Azure Portal setup required!

1. Create an admin account (first time setup)
2. Navigate to **Settings** → **OAuth Accounts**
3. Click **Sign in with Microsoft**
4. Complete the Microsoft OAuth flow
5. Your account should appear in the connected accounts list
6. Create an IMAP ingestion source with **Use OAuth2** enabled

### Step 8b: Advanced - Custom Azure Application (Optional)

If you need a custom Azure application for your organization:

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** → **App registrations** → **New registration**
3. Set redirect URI: `http://localhost:4000/api/v1/auth/outlook/callback`
4. Add API permissions:
   - `IMAP.AccessAsUser.All`
   - `SMTP.Send`
   - `offline_access`
   - `openid`, `profile`, `email`
5. Add to your `.env` file:
   ```bash
   MS_CLIENT_ID=your-application-client-id
   MS_REDIRECT_URI=http://localhost:4000/api/v1/auth/outlook/callback
   ```
6. Restart the dev server

---

## Option 2: Docker Development (Slower but Isolated) 🐳

If you prefer using Docker, you'll need to build the image locally since the pre-built image doesn't have the OAuth2 changes.

### Step 1: Clone and Switch to Branch

```bash
git clone https://github.com/sorglos123/OpenArchiver.git
cd OpenArchiver
git checkout copilot/add-oauth2-integration
```

### Step 2: Build Local Docker Image

Create a `docker-compose.local.yml`:

```yaml
version: '3.8'

services:
  open-archiver:
    build:
      context: .
      dockerfile: apps/open-archiver/Dockerfile
    container_name: open-archiver-local
    restart: unless-stopped
    ports:
      - '3000:3000'
    env_file:
      - .env
    volumes:
      - ${STORAGE_LOCAL_ROOT_PATH}:${STORAGE_LOCAL_ROOT_PATH}
    depends_on:
      - postgres
      - valkey
      - meilisearch
    networks:
      - open-archiver-net

  postgres:
    image: postgres:17-alpine
    container_name: postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-open_archive}
      POSTGRES_USER: ${POSTGRES_USER:-admin}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-password}
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - open-archiver-net

  valkey:
    image: valkey/valkey:8-alpine
    container_name: valkey
    restart: unless-stopped
    command: valkey-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - valkeydata:/data
    networks:
      - open-archiver-net

  meilisearch:
    image: getmeili/meilisearch:v1.15
    container_name: meilisearch
    restart: unless-stopped
    environment:
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY:-aSampleMasterKey}
    volumes:
      - meilidata:/meili_data
    networks:
      - open-archiver-net

  tika:
    image: apache/tika:3.2.2.0-full
    container_name: tika
    restart: always
    networks:
      - open-archiver-net

volumes:
  pgdata:
  valkeydata:
  meilidata:

networks:
  open-archiver-net:
    driver: bridge
```

### Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add OAuth configuration (optional - uses public client by default):

```bash
# Only needed for custom Azure applications
# MS_CLIENT_ID=your-azure-app-client-id
# MS_REDIRECT_URI=http://localhost:4000/api/v1/auth/outlook/callback

# Required: Generate encryption key
ENCRYPTION_KEY=$(openssl rand -hex 32)
```

### Step 4: Build and Run

```bash
# Build the local image (this will take several minutes)
docker compose -f docker-compose.local.yml build

# Start all services
docker compose -f docker-compose.local.yml up -d

# Check logs
docker compose -f docker-compose.local.yml logs -f open-archiver
```

### Step 5: Run Migrations

```bash
docker compose -f docker-compose.local.yml exec open-archiver pnpm db:migrate
```

---

## Testing OAuth2 Features

### 1. Backend API Testing

Test OAuth endpoints directly:

```bash
# Start OAuth flow (requires authentication token)
curl -X GET http://localhost:4000/api/v1/auth/outlook/start \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# List OAuth tokens
curl -X GET http://localhost:4000/api/v1/auth/tokens \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 2. Frontend Testing

1. **Sign in with Microsoft**:
   - Navigate to Settings → OAuth Accounts
   - Click "Sign in with Microsoft"
   - Complete Microsoft authentication
   - Verify account appears in the list

2. **Create IMAP Source with OAuth**:
   - Go to Archive → Ingestions
   - Add new Generic IMAP source
   - Check "Use OAuth2"
   - Configure host: `outlook.office365.com`
   - Port: `993`
   - Username: Your Microsoft email

3. **Test Email Sync**:
   - The ingestion should start automatically
   - Check logs for OAuth token usage
   - Verify emails are being fetched

### 3. Database Inspection

Check OAuth tokens in database:

```bash
# Access Postgres
docker exec -it postgres-dev psql -U admin -d open_archive

# Query OAuth tokens (they're encrypted)
SELECT id, user_id, provider, email, expires_at, created_at 
FROM oauth_tokens;
```

---

## Troubleshooting

### "MS_CLIENT_ID is not set"

**Solution**: You need to register an Azure application first. See Step 8 above.

### "Failed to obtain OAuth access token"

**Causes**:
- OAuth token not found in database
- Token expired and refresh failed
- Network issues

**Solution**:
1. Go to Settings → OAuth Accounts
2. Delete the existing token
3. Re-authenticate with Microsoft

### "Invalid redirect URI"

**Causes**:
- Redirect URI in `.env` doesn't match Azure Portal
- Using wrong port (should be 4000 for backend, not 3000)

**Solution**:
- Azure Portal redirect URI: `http://localhost:4000/api/v1/auth/outlook/callback`
- `.env` MS_REDIRECT_URI: `http://localhost:4000/api/v1/auth/outlook/callback`

### Database Migration Errors

**Solution**:
```bash
# Reset database (WARNING: deletes all data)
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate:dev
```

### Port Already in Use

**Solution**:
```bash
# Find process using port 4000
lsof -ti:4000 | xargs kill -9

# Or use different ports in .env
PORT_BACKEND=4001
```

### Dependencies Installation Issues

**Solution**:
```bash
# Clear pnpm cache
pnpm store prune

# Remove node_modules and reinstall
rm -rf node_modules packages/*/node_modules apps/*/node_modules
pnpm install
```

---

## Key Files Modified for OAuth2

- `packages/backend/src/database/schema/oauth-tokens.ts` - Token schema
- `packages/backend/src/services/OAuthService.ts` - OAuth logic
- `packages/backend/src/api/controllers/oauth.controller.ts` - API endpoints
- `packages/backend/src/services/ingestion-connectors/ImapConnector.ts` - XOAUTH2 support
- `packages/frontend/src/routes/dashboard/settings/oauth-accounts/+page.svelte` - UI
- `packages/types/src/oauth.types.ts` - TypeScript types
- `.env.example` - New OAuth environment variables

---

## Development Tips

### Hot Reload

- **Backend**: Changes require TypeScript recompilation (automatic with `dev` script)
- **Frontend**: Changes are hot-reloaded automatically
- **Types**: Changes in `packages/types` require rebuilding dependent packages

### Debugging

**Backend**:
```bash
# Add debug logging
import { logger } from '../config/logger';
logger.info({ tokenId }, 'OAuth token retrieved');
```

**Frontend**:
```javascript
// Use browser console
console.log('OAuth response:', data);
```

### Code Quality

Before committing:
```bash
# Check formatting
pnpm lint

# Fix formatting
pnpm format
```

---

## Summary

- ✅ **Best for testing**: Local development (Option 1) - faster, easier debugging
- ⚠️ **Docker**: Requires local build since pre-built image lacks OAuth2 changes
- 📝 **Must have**: Azure app registration for OAuth2 testing
- 🔐 **Required env vars**: `MS_CLIENT_ID`, `MS_REDIRECT_URI`, `ENCRYPTION_KEY`

For questions or issues, check the [OAuth2 documentation](./docs/user-guides/email-providers/oauth2.md) or open an issue on GitHub.
