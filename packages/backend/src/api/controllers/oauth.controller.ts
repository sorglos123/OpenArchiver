import type { Request, Response } from 'express';
import { OAuthService } from '../../services/OAuthService';
import { logger } from '../../config/logger';

interface PKCESession {
	codeVerifier: string;
	state: string;
	timestamp: number;
}

// In-memory storage for PKCE session data (in production, use Redis)
const pkceSessionStore = new Map<string, PKCESession>();

// Clean up expired sessions every 10 minutes
setInterval(() => {
	const now = Date.now();
	for (const [key, session] of pkceSessionStore.entries()) {
		// Remove sessions older than 10 minutes
		if (now - session.timestamp > 10 * 60 * 1000) {
			pkceSessionStore.delete(key);
		}
	}
}, 10 * 60 * 1000);

export class OAuthController {
	#oauthService: OAuthService;

	constructor(oauthService: OAuthService) {
		this.#oauthService = oauthService;
	}

	/**
	 * Start OAuth2 flow for Microsoft Outlook
	 * GET /api/v1/auth/outlook/start
	 */
	public startOutlookAuth = async (req: Request, res: Response): Promise<Response> => {
		try {
			// Ensure user is authenticated
			if (!req.user?.id) {
				return res.status(401).json({ message: 'Unauthorized' });
			}

			// Generate PKCE challenge and state
			const pkce = this.#oauthService.generatePKCE();
			const state = this.#oauthService.generateState();

			// Store PKCE session data
			pkceSessionStore.set(state, {
				codeVerifier: pkce.codeVerifier,
				state,
				timestamp: Date.now(),
			});

			// Get Microsoft config and build authorization URL
			const config = this.#oauthService.getMicrosoftConfig();
			const authUrl = this.#oauthService.buildAuthorizationUrl(
				config,
				state,
				pkce.codeChallenge
			);

			logger.info({ userId: req.user.id }, 'Starting OAuth flow for Microsoft');

			return res.json({ authorizationUrl: authUrl });
		} catch (error: any) {
			logger.error({ error }, 'Failed to start OAuth flow');
			return res.status(500).json({ message: 'Failed to start OAuth flow', error: error.message });
		}
	};

	/**
	 * Handle OAuth2 callback from Microsoft
	 * GET /api/v1/auth/outlook/callback
	 */
	public handleOutlookCallback = async (req: Request, res: Response): Promise<void> => {
		try {
			const { code, state, error, error_description } = req.query;

			// Check for OAuth errors
			if (error) {
				logger.error({ error, error_description }, 'OAuth callback error');
				// Redirect to frontend with error
				return res.redirect(
					`${process.env.APP_URL}/dashboard/settings/oauth-accounts?error=${encodeURIComponent(error_description || error)}`
				);
			}

			// Validate required parameters
			if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
				return res.redirect(
					`${process.env.APP_URL}/dashboard/settings/oauth-accounts?error=Invalid+callback+parameters`
				);
			}

			// Retrieve PKCE session data
			const pkceSession = pkceSessionStore.get(state);
			if (!pkceSession) {
				return res.redirect(
					`${process.env.APP_URL}/dashboard/settings/oauth-accounts?error=Invalid+or+expired+state+parameter`
				);
			}

			// Clean up session data
			pkceSessionStore.delete(state);

			// Ensure user is authenticated
			if (!req.user?.id) {
				return res.redirect(
					`${process.env.APP_URL}/dashboard/settings/oauth-accounts?error=Unauthorized`
				);
			}

			// Exchange authorization code for tokens
			const config = this.#oauthService.getMicrosoftConfig();
			const tokenResponse = await this.#oauthService.exchangeCodeForToken(
				config,
				code,
				pkceSession.codeVerifier
			);

			// Parse email from token (Microsoft returns email in the token response)
			// For now, we'll need to get user info from Microsoft Graph API
			// For simplicity in this MVP, we'll use the user's authenticated email
			const userEmail = req.user.email;

			// Store token in database
			const token = await this.#oauthService.storeToken(
				req.user.id,
				'microsoft',
				userEmail,
				tokenResponse
			);

			logger.info({ userId: req.user.id, email: userEmail }, 'OAuth tokens stored successfully');

			// Redirect back to frontend with success
			res.redirect(
				`${process.env.APP_URL}/dashboard/settings/oauth-accounts?success=true&email=${encodeURIComponent(userEmail)}`
			);
		} catch (error: any) {
			logger.error({ error }, 'Failed to handle OAuth callback');
			res.redirect(
				`${process.env.APP_URL}/dashboard/settings/oauth-accounts?error=${encodeURIComponent(error.message || 'Failed to complete OAuth authentication')}`
			);
		}
	};

	/**
	 * Refresh an expired OAuth token
	 * POST /api/v1/auth/token/refresh
	 */
	public refreshToken = async (req: Request, res: Response): Promise<Response> => {
		try {
			const { tokenId } = req.body;

			if (!tokenId) {
				return res.status(400).json({ message: 'Token ID is required' });
			}

			// Ensure user is authenticated
			if (!req.user?.id) {
				return res.status(401).json({ message: 'Unauthorized' });
			}

			const refreshedToken = await this.#oauthService.refreshToken(tokenId);

			logger.info({ userId: req.user.id, tokenId }, 'Token refreshed successfully');

			return res.json({
				message: 'Token refreshed successfully',
				expiresAt: refreshedToken.expiresAt,
			});
		} catch (error: any) {
			logger.error({ error }, 'Failed to refresh token');
			return res.status(500).json({ 
				message: 'Failed to refresh token', 
				error: error.message 
			});
		}
	};

	/**
	 * List all OAuth tokens for the authenticated user
	 * GET /api/v1/auth/tokens
	 */
	public listTokens = async (req: Request, res: Response): Promise<Response> => {
		try {
			// Ensure user is authenticated
			if (!req.user?.id) {
				return res.status(401).json({ message: 'Unauthorized' });
			}

			const tokens = await this.#oauthService.listUserTokens(req.user.id);

			// Don't return actual token values, just metadata
			const sanitizedTokens = tokens.map((token) => ({
				id: token.id,
				provider: token.provider,
				email: token.email,
				expiresAt: token.expiresAt,
				scope: token.scope,
				createdAt: token.createdAt,
				updatedAt: token.updatedAt,
			}));

			return res.json({ tokens: sanitizedTokens });
		} catch (error: any) {
			logger.error({ error }, 'Failed to list tokens');
			return res.status(500).json({ message: 'Failed to list tokens', error: error.message });
		}
	};

	/**
	 * Delete an OAuth token
	 * DELETE /api/v1/auth/tokens/:tokenId
	 */
	public deleteToken = async (req: Request, res: Response): Promise<Response> => {
		try {
			const { tokenId } = req.params;

			// Ensure user is authenticated
			if (!req.user?.id) {
				return res.status(401).json({ message: 'Unauthorized' });
			}

			await this.#oauthService.deleteToken(tokenId);

			logger.info({ userId: req.user.id, tokenId }, 'Token deleted successfully');

			return res.json({ message: 'Token deleted successfully' });
		} catch (error: any) {
			logger.error({ error }, 'Failed to delete token');
			return res.status(500).json({ message: 'Failed to delete token', error: error.message });
		}
	};
}
