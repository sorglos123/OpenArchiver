/**
 * OAuth2 token information stored in the database
 */
export interface OAuthToken {
	id: string;
	userId: string;
	provider: string;
	email: string;
	accessToken: string;
	refreshToken?: string | null;
	expiresAt?: Date | null;
	scope?: string | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * PKCE (Proof Key for Code Exchange) challenge information
 * Used for secure OAuth2 flows
 */
export interface PKCEChallenge {
	codeVerifier: string;
	codeChallenge: string;
	codeChallengeMethod: 'S256';
}

/**
 * OAuth2 authorization request parameters
 */
export interface OAuthAuthorizationRequest {
	provider: 'microsoft' | 'google';
	state: string;
	codeChallenge: string;
	codeChallengeMethod: 'S256';
	redirectUri: string;
}

/**
 * OAuth2 token response from provider
 */
export interface OAuthTokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	token_type: string;
	scope?: string;
}

/**
 * OAuth2 provider configuration
 */
export interface OAuthProviderConfig {
	clientId: string;
	clientSecret?: string;
	redirectUri: string;
	authorizationEndpoint: string;
	tokenEndpoint: string;
	scopes: string[];
}
