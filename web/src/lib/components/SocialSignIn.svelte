<script>
	import { authClient } from "$lib/auth-client.js"
	// official marks from the providers
	import lichessLogo from "$lib/assets/lichess-logo.svg?raw"
	import chesscomLogo from "$lib/assets/chesscom-logo.png"

	// verb: "Log in" on the login page, "Register" on the register page
	let { verb = "Log in", callbackURL = "/my-flashcards", onError } = $props();

	const lichess = async () => {
		const { error } = await authClient.signIn.oauth2({ providerId: "lichess", callbackURL });
		if (error) onError?.(error.message ?? "Could not start lichess sign in");
	}

	const google = async () => {
		const { error } = await authClient.signIn.social({ provider: "google", callbackURL });
		if (error) onError?.(error.message ?? "Could not start Google sign in");
	}
</script>

<div class="social-buttons">
	<button type="button" class="google-btn" onclick={google}>
		<span class="logo">
			<svg viewBox="0 0 48 48" aria-hidden="true">
				<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
				<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
				<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
				<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
			</svg>
		</span>
		{verb} with Google
	</button>
	<button
		type="button"
		class="icon-btn"
		title="{verb} with Lichess"
		aria-label="{verb} with Lichess"
		onclick={lichess}
	>
		<span class="logo">{@html lichessLogo}</span>
	</button>
	<button
		type="button"
		class="icon-btn chesscom"
		disabled
		title="Chess.com sign-in coming soon"
		aria-label="Chess.com sign-in coming soon"
	>
		<img class="logo" src={chesscomLogo} alt="" />
	</button>
</div>
<div class="divider"><span>or</span></div>

<style>
	/* full row, like the form inputs: the google button takes the free space */
	.social-buttons {
		display: flex;
		gap: 8px;
	}
	.google-btn {
		flex-grow: 1;
		padding: 9px 16px;
	}
	.social-buttons button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		border: 1px solid rgba(0, 0, 0, 0.25);
		border-radius: 6px;
		background-color: white;
		font-size: 1rem;
		cursor: pointer;
	}
	.social-buttons button:hover:enabled {
		background-color: #f4f4f4;
	}
	.icon-btn {
		width: 42px;
		flex-shrink: 0;
	}
	.icon-btn:disabled {
		cursor: default;
	}
	.logo {
		display: flex;
		width: 22px;
		height: 22px;
	}
	.logo :global(svg) {
		width: 100%;
		height: 100%;
	}
	.divider {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 16px 0;
		color: rgba(0, 0, 0, 0.45);
		font-size: 0.85rem;
	}
	.divider::before,
	.divider::after {
		content: "";
		flex: 1;
		border-top: 1px solid rgba(0, 0, 0, 0.12);
	}
</style>
