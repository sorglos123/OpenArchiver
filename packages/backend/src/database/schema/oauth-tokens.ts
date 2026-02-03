import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { relations } from 'drizzle-orm';

/**
 * The `oauth_tokens` table stores OAuth2 access and refresh tokens for connected email accounts.
 * Tokens are encrypted using the ENCRYPTION_KEY for security.
 */
export const oauthTokens = pgTable('oauth_tokens', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	provider: text('provider').notNull(), // e.g., 'microsoft', 'google'
	email: text('email').notNull(), // The email address associated with this OAuth account
	accessToken: text('access_token').notNull(), // Encrypted access token
	refreshToken: text('refresh_token'), // Encrypted refresh token
	expiresAt: timestamp('expires_at', { withTimezone: true }), // Token expiration time
	scope: text('scope'), // OAuth scopes granted
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const oauthTokensRelations = relations(oauthTokens, ({ one }) => ({
	user: one(users, {
		fields: [oauthTokens.userId],
		references: [users.id],
	}),
}));
