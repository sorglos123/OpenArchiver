import crypto from 'crypto';
import axios from 'axios';
import type {
	OAuthToken,
	OAuthTokenResponse,
	OAuthProviderConfig,
	PKCEChallenge,
} from '@open-archiver/types';
import { db } from '../database';
import { oauthTokens } from '../database/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../config/logger';
import { CryptoService } from './CryptoService';

/**
 * Microsoft's public OAuth client ID used by Thunderbird and other email clients.
 * This allows users to authenticate without registering their own Azure application.
 * 
 * Users can override this by setting MS_CLIENT_ID environment variable for custom applications.
 */
const MICROSOFT_PUBLIC_CLIENT_ID = '9e5f94bc-e8a4-4e73-b8be-63364c29d753';

/**
 * Service for managing OAuth2 authentication flows and token management.
 * Supports PKCE (Proof Key for Code Exchange) for enhanced security.
 * 
 * By default, uses Microsoft's public client ID for seamless authentication.
 * Custom client IDs can be configured via MS_CLIENT_ID environment variable.
 */
export class OAuthService {
	private cryptoService: CryptoService;

	constructor() {
		this.cryptoService = new CryptoService();
	}

	/**
	 * Generate PKCE code verifier and challenge for OAuth2 authorization flow
	 */
	generatePKCE(): PKCEChallenge {
		// Generate a random code verifier (43-128 characters)
		const codeVerifier = crypto.randomBytes(32).toString('base64url');

		// Create SHA256 hash of the code verifier
		const codeChallenge = crypto
			.createHash('sha256')
			.update(codeVerifier)
			.digest('base64url');

		return {
			codeVerifier,
			codeChallenge,
			codeChallengeMethod: 'S256',
		};
	}

	/**
	 * Generate a random state parameter for OAuth2 flow
	 */
	generateState(): string {
		return crypto.randomBytes(16).toString('hex');
	}

	/**
	 * Get OAuth provider configuration for Microsoft.
	 * 
	 * Uses Microsoft's public client ID by default (same as Thunderbird),
	 * allowing users to authenticate without registering an Azure application.
	 * 
	 * Custom client IDs can be provided via MS_CLIENT_ID environment variable
	 * for organizations requiring their own registered applications.
	 */
	getMicrosoftConfig(): OAuthProviderConfig {
		// Use public client ID by default, allow override via environment variable
		const clientId = process.env.MS_CLIENT_ID || MICROSOFT_PUBLIC_CLIENT_ID;
		
		// Default redirect URI for local development, can be overridden
		const redirectUri = process.env.MS_REDIRECT_URI || 
			`${process.env.APP_URL || 'http://localhost:3000'}/api/v1/auth/outlook/callback`.replace(':3000', ':4000');

		logger.info({ 
			usingPublicClient: !process.env.MS_CLIENT_ID,
			clientId: clientId.substring(0, 8) + '...' 
		}, 'OAuth configuration loaded');

		return {
			clientId,
			redirectUri,
			authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
			tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
			scopes: [
				'https://outlook.office365.com/IMAP.AccessAsUser.All',
				'https://outlook.office365.com/SMTP.Send',
				'offline_access',
				'openid',
				'profile',
				'email',
			],
		};
	}

	/**
	 * Build authorization URL for OAuth2 flow
	 */
	buildAuthorizationUrl(
		config: OAuthProviderConfig,
		state: string,
		codeChallenge: string
	): string {
		const params = new URLSearchParams({
			client_id: config.clientId,
			response_type: 'code',
			redirect_uri: config.redirectUri,
			scope: config.scopes.join(' '),
			state,
			code_challenge: codeChallenge,
			code_challenge_method: 'S256',
			response_mode: 'query',
		});

		return `${config.authorizationEndpoint}?${params.toString()}`;
	}

	/**
	 * Exchange authorization code for access token
	 */
	async exchangeCodeForToken(
		config: OAuthProviderConfig,
		code: string,
		codeVerifier: string
	): Promise<OAuthTokenResponse> {
		try {
			const response = await axios.post<OAuthTokenResponse>(
				config.tokenEndpoint,
				new URLSearchParams({
					client_id: config.clientId,
					code,
					redirect_uri: config.redirectUri,
					grant_type: 'authorization_code',
					code_verifier: codeVerifier,
				}),
				{
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
					},
				}
			);

			return response.data;
		} catch (error: any) {
			logger.error({ error: error.response?.data || error }, 'Failed to exchange code for token');
			throw new Error('Failed to exchange authorization code for token');
		}
	}

	/**
	 * Refresh an expired OAuth2 access token
	 */
	async refreshToken(tokenId: string): Promise<OAuthToken> {
		const [token] = await db
			.select()
			.from(oauthTokens)
			.where(eq(oauthTokens.id, tokenId))
			.limit(1);

		if (!token) {
			throw new Error('OAuth token not found');
		}

		if (!token.refreshToken) {
			throw new Error('No refresh token available');
		}

		// Decrypt the refresh token
		const decryptedRefreshToken = this.cryptoService.decrypt(token.refreshToken);

		let config: OAuthProviderConfig;
		if (token.provider === 'microsoft') {
			config = this.getMicrosoftConfig();
		} else {
			throw new Error(`Unsupported OAuth provider: ${token.provider}`);
		}

		try {
			const response = await axios.post<OAuthTokenResponse>(
				config.tokenEndpoint,
				new URLSearchParams({
					client_id: config.clientId,
					refresh_token: decryptedRefreshToken,
					grant_type: 'refresh_token',
				}),
				{
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
					},
				}
			);

			const expiresAt = new Date(Date.now() + response.data.expires_in * 1000);

			// Update token in database with encrypted values
			const [updatedToken] = await db
				.update(oauthTokens)
				.set({
					accessToken: this.cryptoService.encrypt(response.data.access_token),
					refreshToken: response.data.refresh_token
						? this.cryptoService.encrypt(response.data.refresh_token)
						: token.refreshToken,
					expiresAt,
					updatedAt: new Date(),
				})
				.where(eq(oauthTokens.id, tokenId))
				.returning();

			return updatedToken;
		} catch (error: any) {
			logger.error({ error: error.response?.data || error }, 'Failed to refresh token');
			throw new Error('Failed to refresh OAuth token');
		}
	}

	/**
	 * Store OAuth2 token in database (encrypted)
	 */
	async storeToken(
		userId: string,
		provider: string,
		email: string,
		tokenResponse: OAuthTokenResponse
	): Promise<OAuthToken> {
		const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);

		// Encrypt tokens before storing
		const encryptedAccessToken = this.cryptoService.encrypt(tokenResponse.access_token);
		const encryptedRefreshToken = tokenResponse.refresh_token
			? this.cryptoService.encrypt(tokenResponse.refresh_token)
			: null;

		const [token] = await db
			.insert(oauthTokens)
			.values({
				userId,
				provider,
				email,
				accessToken: encryptedAccessToken,
				refreshToken: encryptedRefreshToken,
				expiresAt,
				scope: tokenResponse.scope,
			})
			.returning();

		return token;
	}

	/**
	 * Get OAuth token for a user and email (decrypted)
	 */
	async getToken(userId: string, email: string, provider: string): Promise<OAuthToken | null> {
		const [token] = await db
			.select()
			.from(oauthTokens)
			.where(
				and(
					eq(oauthTokens.userId, userId),
					eq(oauthTokens.email, email),
					eq(oauthTokens.provider, provider)
				)
			)
			.limit(1);

		if (!token) {
			return null;
		}

		// Check if token is expired and refresh if needed
		if (token.expiresAt && token.expiresAt < new Date()) {
			try {
				return await this.refreshToken(token.id);
			} catch (error) {
				logger.error({ error }, 'Failed to refresh expired token');
				return null;
			}
		}

		return token;
	}

	/**
	 * Get decrypted access token
	 */
	getDecryptedAccessToken(token: OAuthToken): string {
		return this.cryptoService.decrypt(token.accessToken);
	}

	/**
	 * Delete OAuth token
	 */
	async deleteToken(tokenId: string): Promise<void> {
		await db.delete(oauthTokens).where(eq(oauthTokens.id, tokenId));
	}

	/**
	 * List all OAuth tokens for a user
	 */
	async listUserTokens(userId: string): Promise<OAuthToken[]> {
		return await db.select().from(oauthTokens).where(eq(oauthTokens.userId, userId));
	}
}
