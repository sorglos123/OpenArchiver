# OAuth2 Development Troubleshooting Guide

Common issues when developing/testing the OAuth2 integration and their solutions.

**Note**: OAuth2 now works out of the box using Microsoft's public client (same as Thunderbird). You don't need to register an Azure application unless you want a custom client ID for your organization.

## Setup Issues

### ℹ️ "Using public OAuth client" in logs

**This is normal!** If you see this in the logs, OAuth2 is using the default public client ID.

**No action needed** - This is the expected behavior unless you've configured a custom MS_CLIENT_ID.

### ❌ "MS_CLIENT_ID environment variable is not set" (OUTDATED)

**This error should no longer occur** with the updated implementation. If you see it:

**Cause**: Old code or cached build.

**Solution**:
1. Pull latest changes from the branch
2. Rebuild: `pnpm build`
3. Restart dev server

The new implementation uses a public client ID by default.

---

### ❌ "ENCRYPTION_KEY environment variable is not set"

**Symptom**: Error when trying to store OAuth tokens.

**Cause**: Missing encryption key for token storage.

**Solution**:
```bash
# Generate and add to .env
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# Restart dev server
```

**Verify**:
```bash
grep ENCRYPTION_KEY .env
# Should show a 64-character hex string
```

---

### ❌ "Database connection failed" / "connect ECONNREFUSED 127.0.0.1:5432"

**Symptom**: Backend fails to start, can't connect to PostgreSQL.

**Cause**: PostgreSQL not running or wrong connection string.

**Solution**:
```bash
# Check if Postgres is running
docker ps | grep postgres

# If not running, start infrastructure
docker compose -f docker-compose.dev.yml up -d

# Verify connection string in .env
DATABASE_URL="postgresql://admin:password@localhost:5432/open_archive"
```

**Test Connection**:
```bash
docker exec -it postgres-dev psql -U admin -d open_archive -c "SELECT 1"
# Should output: 1
```

---

### ❌ "oauth_tokens table does not exist"

**Symptom**: Error when trying to store or retrieve OAuth tokens.

**Cause**: Database migrations not run.

**Solution**:
```bash
# Run migrations
pnpm db:migrate:dev

# Verify table exists
docker exec -it postgres-dev psql -U admin -d open_archive \
  -c "\dt oauth_tokens"
```

---

## OAuth Flow Issues

### ❌ "redirect_uri_mismatch" from Microsoft

**Symptom**: After Microsoft login, get error about redirect URI mismatch.

**Cause**: When using a **custom client ID**, the redirect URI must match Azure Portal configuration.

**Solution for Public Client (Default)**:
The public client works with any redirect URI. If you see this error:
1. You're likely using a custom MS_CLIENT_ID
2. Check your Azure Portal configuration matches your redirect URI
3. Or remove MS_CLIENT_ID from .env to use the public client

**Solution for Custom Client ID**:
1. Check your `.env`:
   ```bash
   MS_REDIRECT_URI=http://localhost:4000/api/v1/auth/outlook/callback
   ```

2. Ensure Azure Portal has **exact same URL**:
   - Go to Azure Portal → Your App → Authentication
   - Platform: Web
   - Redirect URI: `http://localhost:4000/api/v1/auth/outlook/callback`
   - ⚠️ Note port 4000 (backend), not 3000 (frontend)
   - ⚠️ Note `/api/v1/auth/outlook/callback` path

3. Restart dev server after changing `.env`

**Common Mistakes**:
- Using port 3000 instead of 4000
- Missing `/api/v1` prefix
- Using HTTPS locally (use HTTP for localhost)
- Trailing slash: `/callback/` vs `/callback`

**Recommended**: Remove MS_CLIENT_ID and use the public client to avoid these issues.

---

### ❌ "Invalid or expired state parameter"

**Symptom**: After returning from Microsoft login, get this error.

**Cause**: OAuth state expired or browser navigation issue.

**Solution**:
- PKCE session expires after 10 minutes
- Don't use browser back/forward during OAuth flow
- Start the flow again from Settings → OAuth Accounts

**Prevention**:
- Complete OAuth flow within 10 minutes
- Don't refresh/navigate during the flow

---

### ❌ "Unauthorized" when accessing OAuth endpoints

**Symptom**: 401 error when calling `/api/v1/auth/outlook/start` or `/api/v1/auth/tokens`.

**Cause**: Not logged in or invalid JWT token.

**Solution**:
1. Ensure you're logged into Open Archiver
2. Check browser console for JWT in requests
3. If token expired, log out and log back in

**Debug**:
```bash
# Check if JWT is being sent
# In browser DevTools → Network → Request Headers
# Should see: Authorization: Bearer eyJ...
```

---

## Token Issues

### ❌ "Failed to obtain OAuth access token"

**Symptom**: Error when IMAP connector tries to use OAuth.

**Causes & Solutions**:

**Cause 1**: No OAuth token stored for user
```bash
# Check if token exists
docker exec -it postgres-dev psql -U admin -d open_archive \
  -c "SELECT email FROM oauth_tokens;"

# If empty, connect account via Settings → OAuth Accounts
```

**Cause 2**: Token expired and refresh failed
```bash
# Check token expiration
docker exec -it postgres-dev psql -U admin -d open_archive \
  -c "SELECT email, expires_at FROM oauth_tokens;"

# If expired, reconnect the account
```

**Cause 3**: OAuth token ID not set in ingestion source
- Edit ingestion source
- Ensure "Use OAuth2" is checked
- Username matches connected OAuth account email

---

### ❌ "Token refresh failed"

**Symptom**: Logs show token refresh errors.

**Causes**:
- Refresh token expired (90 days of inactivity)
- Token revoked in Microsoft account
- Network connectivity issues

**Solution**:
1. Go to Settings → OAuth Accounts
2. Delete the expired token
3. Reconnect: Click "Sign in with Microsoft"
4. Update IMAP ingestion source if needed

---

## Development Server Issues

### ❌ "Port 4000 already in use"

**Symptom**: Backend won't start.

**Solution**:
```bash
# Find and kill process
lsof -ti:4000 | xargs kill -9

# Or use different port in .env
PORT_BACKEND=4001
```

---

### ❌ "pnpm: command not found"

**Symptom**: Can't run pnpm commands.

**Solution**:
```bash
# Install pnpm
npm install -g pnpm@10.13.1

# Verify
pnpm --version
# Should output: 10.13.1
```

---

### ❌ TypeScript compilation errors after pulling branch

**Symptom**: Build errors about missing types or imports.

**Solution**:
```bash
# Clean and rebuild
rm -rf node_modules packages/*/node_modules apps/*/node_modules
rm -rf packages/*/dist apps/*/dist
pnpm install
pnpm build
```

---

## Frontend Issues

### ❌ OAuth Accounts page shows blank/loading forever

**Symptom**: Page loads but never shows content.

**Causes & Solutions**:

**Cause 1**: API request failing
```javascript
// Check browser console for errors
// Look for failed /api/v1/auth/tokens request
```

**Cause 2**: Backend not running
```bash
# Check backend is running on port 4000
curl http://localhost:4000
# Should respond with "Backend is running!!"
```

**Cause 3**: CORS issues
```bash
# Check .env
APP_URL=http://localhost:3000
# Backend CORS is configured to allow this origin
```

---

### ❌ "Sign in with Microsoft" button does nothing

**Symptom**: Click button, nothing happens.

**Debug**:
1. Open browser DevTools → Console
2. Look for JavaScript errors
3. Check Network tab for failed API calls

**Common Issues**:
- Backend not running
- Invalid MS_CLIENT_ID
- Network request blocked by browser

---

## Database Debugging

### View OAuth Tokens (Encrypted)

```sql
-- Connect to database
docker exec -it postgres-dev psql -U admin -d open_archive

-- View all tokens (tokens are encrypted)
SELECT 
  id,
  provider,
  email,
  expires_at,
  created_at,
  updated_at
FROM oauth_tokens;

-- Check if token expired
SELECT 
  email,
  expires_at < NOW() as is_expired,
  expires_at
FROM oauth_tokens;

-- Delete all tokens (for testing)
DELETE FROM oauth_tokens;
```

### View Ingestion Sources

```sql
-- Check IMAP sources
SELECT 
  id,
  name,
  provider,
  status,
  credentials::text LIKE '%useOAuth%' as has_oauth
FROM ingestion_sources
WHERE provider = 'generic_imap';
```

---

## Testing Checklist

Before reporting a bug, verify:

- [ ] Infrastructure services running: `docker ps | grep -E "(postgres|valkey|meilisearch)"`
- [ ] Environment variables set: `grep -E "(MS_CLIENT_ID|ENCRYPTION_KEY)" .env`
- [ ] Database migrations run: `pnpm db:migrate:dev`
- [ ] Backend running: `curl http://localhost:4000`
- [ ] Frontend running: `curl http://localhost:3000`
- [ ] Logged into Open Archiver
- [ ] Azure app registered with correct redirect URI
- [ ] Browser console shows no errors

---

## Getting Help

If you're still stuck:

1. **Check existing documentation**:
   - [DEV_SETUP.md](./DEV_SETUP.md) - Full setup guide
   - [QUICK_DEV_REFERENCE.md](./QUICK_DEV_REFERENCE.md) - Command reference
   - [OAuth2 User Guide](./docs/user-guides/email-providers/oauth2.md)

2. **Gather debug info**:
   ```bash
   # System info
   node --version
   pnpm --version
   
   # Service status
   docker ps
   
   # Check logs
   docker compose -f docker-compose.dev.yml logs
   
   # Backend logs (if running locally)
   # Look at terminal where pnpm dev:oss is running
   ```

3. **Create an issue** on GitHub with:
   - Error message (full stack trace)
   - Steps to reproduce
   - Environment info
   - Relevant logs

---

## Quick Reset (Nuclear Option)

If everything is broken and you want to start fresh:

```bash
# Stop everything
docker compose -f docker-compose.dev.yml down -v
pkill -f "node"

# Clean dependencies
rm -rf node_modules packages/*/node_modules apps/*/node_modules
rm -rf packages/*/dist apps/*/dist

# Reinstall
pnpm install

# Start fresh
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate:dev
pnpm dev:oss
```

⚠️ **Warning**: This deletes all data including OAuth tokens. You'll need to reconnect accounts.
