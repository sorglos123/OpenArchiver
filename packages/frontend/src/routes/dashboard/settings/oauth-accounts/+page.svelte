<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { setAlert } from '$lib/components/custom/alert/alert-state.svelte';
	import { api } from '$lib/api.client';
	import { Loader2, Trash2, RefreshCw } from 'lucide-svelte';
	import { t } from '$lib/translations';

	interface OAuthToken {
		id: string;
		provider: string;
		email: string;
		expiresAt: string | null;
		scope: string | null;
		createdAt: string;
		updatedAt: string;
	}

	let tokens = $state<OAuthToken[]>([]);
	let isLoading = $state(false);
	let isDeleting = $state<string | null>(null);
	let deleteDialogOpen = $state(false);
	let tokenToDelete = $state<string | null>(null);

	onMount(async () => {
		// Check for OAuth callback parameters
		const params = new URLSearchParams(window.location.search);
		const success = params.get('success');
		const error = params.get('error');
		const email = params.get('email');

		if (success === 'true') {
			setAlert({
				type: 'success',
				title: 'Success',
				message: `Successfully connected ${email || 'your account'}`,
				duration: 5000,
				show: true
			});
			// Clean up URL
			window.history.replaceState({}, '', window.location.pathname);
		} else if (error) {
			setAlert({
				type: 'error',
				title: 'Error',
				message: decodeURIComponent(error),
				duration: 5000,
				show: true
			});
			// Clean up URL
			window.history.replaceState({}, '', window.location.pathname);
		}

		await loadTokens();
	});

	async function loadTokens() {
		isLoading = true;
		try {
			const response = await api('/auth/tokens');
			if (response.ok) {
				const data = await response.json();
				tokens = data.tokens;
			} else {
				setAlert({
					type: 'error',
					title: 'Error',
					message: 'Failed to load OAuth accounts',
					duration: 3000,
					show: true
				});
			}
		} catch (error) {
			console.error('Failed to load tokens:', error);
			setAlert({
				type: 'error',
				title: 'Error',
				message: 'Failed to load OAuth accounts',
				duration: 3000,
				show: true
			});
		} finally {
			isLoading = false;
		}
	}

	async function startMicrosoftAuth() {
		try {
			const response = await api('/auth/outlook/start');
			if (response.ok) {
				const data = await response.json();
				// Redirect to Microsoft login
				window.location.href = data.authorizationUrl;
			} else {
				setAlert({
					type: 'error',
					title: 'Error',
					message: 'Failed to start OAuth flow',
					duration: 3000,
					show: true
				});
			}
		} catch (error) {
			console.error('Failed to start auth:', error);
			setAlert({
				type: 'error',
				title: 'Error',
				message: 'Failed to start OAuth flow',
				duration: 3000,
				show: true
			});
		}
	}

	function confirmDelete(tokenId: string) {
		tokenToDelete = tokenId;
		deleteDialogOpen = true;
	}

	async function deleteToken() {
		if (!tokenToDelete) return;

		isDeleting = tokenToDelete;
		try {
			const response = await api(`/auth/tokens/${tokenToDelete}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				setAlert({
					type: 'success',
					title: 'Success',
					message: 'OAuth account removed successfully',
					duration: 3000,
					show: true
				});
				await loadTokens();
			} else {
				setAlert({
					type: 'error',
					title: 'Error',
					message: 'Failed to remove OAuth account',
					duration: 3000,
					show: true
				});
			}
		} catch (error) {
			console.error('Failed to delete token:', error);
			setAlert({
				type: 'error',
				title: 'Error',
				message: 'Failed to remove OAuth account',
				duration: 3000,
				show: true
			});
		} finally {
			isDeleting = null;
			deleteDialogOpen = false;
			tokenToDelete = null;
		}
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
	}

	function isTokenExpired(expiresAt: string | null): boolean {
		if (!expiresAt) return false;
		return new Date(expiresAt) < new Date();
	}
</script>

<svelte:head>
	<title>OAuth Accounts - OpenArchiver</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold">OAuth Accounts</h1>
		<p class="text-muted-foreground mt-2">
			Manage your connected email accounts using OAuth2 authentication
		</p>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Connect Email Account</Card.Title>
			<Card.Description>
				Connect your Microsoft Outlook/Hotmail account to access emails via IMAP/SMTP
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Button onclick={startMicrosoftAuth}>
				<svg class="mr-2 h-4 w-4" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path fill="#f3f3f3" d="M0 0h23v23H0z"/>
					<path fill="#f35325" d="M1 1h10v10H1z"/>
					<path fill="#81bc06" d="M12 1h10v10H12z"/>
					<path fill="#05a6f0" d="M1 12h10v10H1z"/>
					<path fill="#ffba08" d="M12 12h10v10H12z"/>
				</svg>
				Sign in with Microsoft
			</Button>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Connected Accounts</Card.Title>
			<Card.Description>
				Your connected OAuth accounts
			</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if isLoading}
				<div class="flex items-center justify-center py-8">
					<Loader2 class="h-6 w-6 animate-spin" />
				</div>
			{:else if tokens.length === 0}
				<div class="text-center py-8 text-muted-foreground">
					No connected accounts. Click "Sign in with Microsoft" above to get started.
				</div>
			{:else}
				<div class="space-y-4">
					{#each tokens as token (token.id)}
						<div class="flex items-center justify-between border rounded-lg p-4">
							<div class="flex-1">
								<div class="font-medium">{token.email}</div>
								<div class="text-sm text-muted-foreground">
									Provider: {token.provider}
								</div>
								<div class="text-sm text-muted-foreground">
									Connected: {formatDate(token.createdAt)}
								</div>
								{#if token.expiresAt}
									<div class="text-sm" class:text-red-500={isTokenExpired(token.expiresAt)}>
										{isTokenExpired(token.expiresAt) ? 'Expired' : 'Expires'}: {formatDate(token.expiresAt)}
									</div>
								{/if}
							</div>
							<div class="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									onclick={() => confirmDelete(token.id)}
									disabled={isDeleting === token.id}
								>
									{#if isDeleting === token.id}
										<Loader2 class="h-4 w-4 animate-spin" />
									{:else}
										<Trash2 class="h-4 w-4" />
									{/if}
								</Button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</div>

<Dialog.Root bind:open={deleteDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Remove OAuth Account</Dialog.Title>
			<Dialog.Description>
				Are you sure you want to remove this OAuth account? This will disconnect the email account
				and you'll need to re-authenticate to use it again.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (deleteDialogOpen = false)}>Cancel</Button>
			<Button variant="destructive" onclick={deleteToken}>Remove</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
