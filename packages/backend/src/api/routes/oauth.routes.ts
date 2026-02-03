import { Router } from 'express';
import type { OAuthController } from '../controllers/oauth.controller';
import { authenticateJWT } from '../middleware/auth';

export const createOAuthRouter = (oauthController: OAuthController): Router => {
	const router = Router();

	/**
	 * @route GET /api/v1/auth/outlook/start
	 * @description Initiates the OAuth2 flow for Microsoft Outlook
	 * @access Private - Requires authentication
	 */
	router.get('/outlook/start', authenticateJWT, oauthController.startOutlookAuth);

	/**
	 * @route GET /api/v1/auth/outlook/callback
	 * @description Handles the OAuth2 callback from Microsoft
	 * @access Private - Requires authentication
	 */
	router.get('/outlook/callback', authenticateJWT, oauthController.handleOutlookCallback);

	/**
	 * @route POST /api/v1/auth/token/refresh
	 * @description Refreshes an expired OAuth2 token
	 * @access Private - Requires authentication
	 */
	router.post('/token/refresh', authenticateJWT, oauthController.refreshToken);

	/**
	 * @route GET /api/v1/auth/tokens
	 * @description Lists all OAuth tokens for the authenticated user
	 * @access Private - Requires authentication
	 */
	router.get('/tokens', authenticateJWT, oauthController.listTokens);

	/**
	 * @route DELETE /api/v1/auth/tokens/:tokenId
	 * @description Deletes an OAuth token
	 * @access Private - Requires authentication
	 */
	router.delete('/tokens/:tokenId', authenticateJWT, oauthController.deleteToken);

	return router;
};
