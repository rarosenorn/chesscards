<script>
	import { authClient } from "$lib/auth-client.js"

	let email = $state("");
	let sent = $state(false);
	let submitting = $state(false);

	const submit = async () => {
		submitting = true;
		await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
		submitting = false;
		// always claim success so the form can't be used to probe which
		// emails have accounts
		sent = true;
	}
</script>

<div class="register-and-login-container">
	<h1>Reset password</h1>
	{#if sent}
		<p class="sent">
			If an account exists for <strong>{email}</strong>, a reset link is on its way.
		</p>
	{:else}
		<form onsubmit={e => { e.preventDefault(); submit(); }}>
			<label for="email">
				Email
				<input id="email" type="email" bind:value={email} required autocomplete="email" />
			</label>
			<button disabled={submitting}>Send reset link</button>
		</form>
	{/if}
	<p class="switch"><a href="/login">Back to log in</a></p>
</div>

<style>
	.register-and-login-container {
		border-radius: 10px;
		border: 1px solid rgba(0, 0, 0, 0.08);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
		background-color: white;
		padding: 32px 36px 24px 36px;
		margin: auto;
		margin-top: 100px;
		width: 400px;
		box-sizing: border-box;

		h1 {
			margin: 0 0 18px 0;
			font-size: 1.5rem;
		}

		.sent {
			margin: 0;
			font-size: 0.95rem;
			color: rgba(0, 0, 0, 0.75);
			line-height: 1.5;
		}

		form {
			display: flex;
			flex-direction: column;
			gap: 14px;

			label {
				display: flex;
				flex-direction: column;
				gap: 5px;
				font-size: 0.92rem;
				color: rgba(0, 0, 0, 0.7);
			}

			input {
				border: 1px solid rgba(0, 0, 0, 0.25);
				border-radius: 6px;
				padding: 9px 10px;
				font-size: 1rem;
			}
			input:focus {
				outline: 2px solid var(--accent);
				outline-offset: -1px;
			}

			button {
				margin-top: 8px;
				padding: 10px 0;
				border: 1px solid var(--accent);
				border-radius: 6px;
				background-color: var(--accent);
				color: white;
				font-size: 1rem;
				cursor: pointer;
			}
			button:hover:enabled {
				background-color: var(--accent-hover);
			}
		}

		.switch {
			margin: 16px 0 0 0;
			font-size: 0.9rem;
			color: rgba(0, 0, 0, 0.6);
			text-align: center;

			a {
				color: inherit;
			}
			a:hover {
				color: black;
			}
		}
	}
</style>
