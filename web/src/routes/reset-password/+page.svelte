<script>
	import { goto } from "$app/navigation"
	import { page } from "$app/state"
	import { authClient } from "$lib/auth-client.js"

	let password = $state("");
	let confirmPassword = $state("");
	let errors = $state([]);
	let submitting = $state(false);

	// better-auth appends ?token= to the redirect link from the email;
	// ?error= arrives instead when the link is invalid or expired
	const token = page.url.searchParams.get("token");
	const linkError = page.url.searchParams.get("error");

	const submit = async () => {
		errors = [];
		if (password !== confirmPassword) {
			errors = ["Passwords do not match"];
			return;
		}
		submitting = true;
		const { error } = await authClient.resetPassword({ newPassword: password, token });
		submitting = false;
		if (error) {
			errors = [error.message ?? "Could not reset the password"];
			return;
		}
		await goto("/login");
	}
</script>

<div class="register-and-login-container">
	<h1>Choose a new password</h1>
	{#if linkError || !token}
		<p class="invalid">This reset link is invalid or has expired. <a href="/forgot-password">Request a new one</a>.</p>
	{:else}
		{#if errors.length > 0}
			<ul class="errors">
				{#each errors as error}
					<li>{error}</li>
				{/each}
			</ul>
		{/if}
		<form onsubmit={e => { e.preventDefault(); submit(); }}>
			<label for="password">
				New password <span class="note">(min. 6 characters)</span>
				<input id="password" type="password" bind:value={password} required minlength="6" autocomplete="new-password" />
			</label>
			<label for="confirm-password">
				Confirm password
				<input id="confirm-password" type="password" bind:value={confirmPassword} required autocomplete="new-password" />
			</label>
			<button disabled={submitting}>Set password</button>
		</form>
	{/if}
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

		.invalid {
			margin: 0;
			font-size: 0.95rem;
			color: rgba(0, 0, 0, 0.75);
		}

		.errors {
			color: red;
			padding-left: 16px;
			margin: 0 0 12px 0;
			font-size: 0.9rem;
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

			.note {
				color: rgba(0, 0, 0, 0.45);
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
	}
</style>
