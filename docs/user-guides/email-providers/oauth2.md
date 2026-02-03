# OAuth2 Authentication for Email Accounts

Open Archiver supports OAuth2 authentication for secure and seamless connection to Microsoft email accounts (Outlook/Hotmail) via IMAP/SMTP. This guide explains how to set up and use OAuth2 authentication.

## Overview

OAuth2 provides a more secure authentication method compared to traditional username/password authentication:

- **No password storage**: Your email password is never stored in Open Archiver
- **Granular permissions**: You control what access the application has
- **Automatic token refresh**: Access tokens are automatically refreshed when they expire
- **Revocable access**: You can revoke access at any time from your Microsoft account settings

## Prerequisites

Before setting up OAuth2 authentication:

1. You must have an Azure account (free tier is sufficient)
2. Administrative access to register applications in Azure Portal
3. A deployed instance of Open Archiver with environment variables configured

## Setting Up OAuth2 for Microsoft Outlook/Hotmail

### Step 1: Register Your Application in Azure

1. Navigate to [Azure Portal](https://portal.azure.com/)

2. Go to **Azure Active Directory** → **App registrations** → **New registration**

3. Fill in the application details:
   - **Name**: Choose a descriptive name (e.g., "Open Archiver OAuth")
   - **Supported account types**: Select "Accounts in any organizational directory and personal Microsoft accounts"
   - **Redirect URI**: 
     - Type: Web
     - URI: `http://your-domain:4000/api/v1/auth/outlook/callback`
     - For local development: `http://localhost:4000/api/v1/auth/outlook/callback`

4. Click **Register**

5. Note down the **Application (client) ID** - you'll need this later

### Step 2: Configure API Permissions

1. In your app registration, navigate to **API permissions** in the left sidebar

2. Click **Add a permission** → **Microsoft Graph** → **Delegated permissions**

3. Add the following permissions:
   - `IMAP.AccessAsUser.All` - Access IMAP as the user
   - `SMTP.Send` - Send mail as the user
   - `offline_access` - Maintain access to data you have given it access to
   - `openid` - Sign users in
   - `profile` - View users' basic profile
   - `email` - View users' email address

4. Click **Add permissions**

5. **Important**: Click **Grant admin consent for [Your Organization]** if you're setting this up for organizational use

### Step 3: Configure Open Archiver

1. Update your `.env` file with the OAuth2 configuration:

```bash
# OAuth2 Configuration
MS_CLIENT_ID=your-application-client-id-from-step-1
MS_REDIRECT_URI=http://your-domain:4000/api/v1/auth/outlook/callback
```

2. Restart your Open Archiver instance to apply the changes:

```bash
docker compose restart
```

## Using OAuth2 Authentication

### Connect Your Email Account

1. Log in to Open Archiver

2. Navigate to **Settings** → **OAuth Accounts**

3. Click **Sign in with Microsoft**

4. You'll be redirected to Microsoft's login page:
   - Enter your Microsoft email and password
   - Review and accept the requested permissions
   - You'll be redirected back to Open Archiver

5. Your account will now appear in the connected accounts list

### Create an IMAP Ingestion Source with OAuth2

1. Navigate to **Archive** → **Ingestions**

2. Click **Add Ingestion Source**

3. Fill in the details:
   - **Name**: Choose a descriptive name
   - **Provider**: Select "Generic IMAP"
   - **Host**: `outlook.office365.com`
   - **Port**: `993`
   - **Username**: Your full Microsoft email address
   - **Use OAuth2**: Check this option
   - **Use TLS**: Enabled (recommended)

4. Click **Create**

5. The ingestion source will use your connected OAuth token for authentication

## Token Management

### Viewing Connected Accounts

Go to **Settings** → **OAuth Accounts** to see all your connected Microsoft accounts with:
- Email address
- Connection date
- Token expiration time
- Provider information

### Automatic Token Refresh

OAuth2 access tokens expire after a certain period. Open Archiver automatically:
- Detects when a token is expired
- Uses the refresh token to obtain a new access token
- Updates the stored token in the database

This happens transparently without any user interaction.

### Revoking Access

To disconnect an OAuth account:

1. Go to **Settings** → **OAuth Accounts**
2. Find the account you want to disconnect
3. Click the trash icon next to the account
4. Confirm the deletion

This will remove the token from Open Archiver. To also revoke the application's access:

1. Go to [Microsoft Account Security](https://account.microsoft.com/privacy/app-permissions)
2. Find "Open Archiver OAuth" (or your app name)
3. Click **Remove these permissions**

## Security Considerations

### Token Storage

- All OAuth tokens are encrypted using AES-256 encryption before being stored in the database
- The encryption key is derived from the `ENCRYPTION_KEY` environment variable
- Never share your `ENCRYPTION_KEY` or database backups containing encrypted tokens

### PKCE (Proof Key for Code Exchange)

Open Archiver implements PKCE for enhanced security:
- A cryptographically random code verifier is generated for each OAuth flow
- The code challenge is sent to Microsoft
- The code verifier is verified during token exchange
- This prevents authorization code interception attacks

### Best Practices

1. **Use HTTPS in production**: Always use HTTPS for your redirect URI in production environments
2. **Rotate encryption keys**: Regularly rotate your `ENCRYPTION_KEY` (requires re-authentication of all OAuth accounts)
3. **Monitor access**: Regularly review connected accounts and remove unused ones
4. **Keep environment variables secure**: Never commit `.env` files to version control

## Troubleshooting

### "Invalid or expired state parameter" error

This usually means:
- The OAuth flow took too long (sessions expire after 10 minutes)
- You navigated back/forward in your browser during the flow
- Solution: Start the OAuth flow again

### "Failed to obtain OAuth access token" error

Possible causes:
- The token has been revoked in your Microsoft account
- Network connectivity issues
- Microsoft OAuth service is down

Solution: Try disconnecting and reconnecting your account

### Redirect URI mismatch error

This means the redirect URI in Azure doesn't match your configuration:
1. Check your `.env` file's `MS_REDIRECT_URI`
2. Ensure it matches exactly what's configured in Azure Portal (including port and path)
3. Update either the `.env` or Azure configuration to match

### Token refresh failures

If token refresh consistently fails:
1. The refresh token may have expired (typically 90 days of inactivity)
2. Solution: Disconnect and reconnect your account

## Advanced Configuration

### Using Custom OAuth Provider

While Microsoft is the default provider, the OAuth implementation is extensible. To add support for other providers:

1. Extend the `OAuthService` class to add provider-specific configurations
2. Update the `OAuthController` to handle the new provider's flow
3. Add appropriate routes for the new provider

### Multiple Email Accounts

You can connect multiple Microsoft accounts:
1. Each account gets its own OAuth token
2. When creating an IMAP ingestion source, the token matching the username is automatically used
3. Ensure you connect all accounts you plan to use before creating ingestion sources

## Database Schema

OAuth tokens are stored in the `oauth_tokens` table:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Unique identifier |
| user_id | UUID | Reference to the user who connected the account |
| provider | TEXT | OAuth provider (e.g., "microsoft") |
| email | TEXT | Email address of the connected account |
| access_token | TEXT | Encrypted access token |
| refresh_token | TEXT | Encrypted refresh token |
| expires_at | TIMESTAMP | When the access token expires |
| scope | TEXT | Granted OAuth scopes |
| created_at | TIMESTAMP | When the token was created |
| updated_at | TIMESTAMP | When the token was last updated |

## API Endpoints

The following API endpoints are available for OAuth management:

- `GET /api/v1/auth/outlook/start` - Initiate OAuth flow
- `GET /api/v1/auth/outlook/callback` - OAuth callback handler
- `GET /api/v1/auth/tokens` - List connected OAuth accounts
- `POST /api/v1/auth/token/refresh` - Manually refresh a token
- `DELETE /api/v1/auth/tokens/:tokenId` - Remove an OAuth token

All endpoints require authentication.

## Limitations

Current OAuth2 implementation:
- Only supports Microsoft Outlook/Hotmail accounts
- Does not support SMTP OAuth2 yet (planned for future release)
- Tokens are user-specific and cannot be shared between Open Archiver users
- Requires manual setup in Azure Portal

## Future Enhancements

Planned improvements:
- Google OAuth2 support for Gmail accounts
- SMTP with OAuth2 authentication
- Simplified setup process with pre-configured OAuth applications
- Multi-tenant OAuth support
- OAuth token usage analytics
