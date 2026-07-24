<script>
	import { authClient } from "$lib/auth-client.js"
	import SocialSignIn from "$lib/components/SocialSignIn.svelte"

	let email = $state("");
	let password = $state("");
	let confirmPassword = $state("");
	let errors = $state([]);
	let submitting = $state(false);
	let sent = $state(false);

	const submit = async () => {
		errors = [];
		if (password !== confirmPassword) {
			errors = ["Passwords do not match"];
			return;
		}
		submitting = true;
		const { error } = await authClient.signUp.email({
			email,
			password,
			// display name defaults to the email's local part; editable on the profile page
			name: email.split("@")[0],
			callbackURL: "/my-flashcards"
		});
		submitting = false;
		if (error) {
			errors = [error.message ?? "Could not create the account"];
			return;
		}
		sent = true;
	}
</script>

<div class="register-and-login-container">
	<h1>Register</h1>
	{#if sent}
		<p class="sent">
			Almost there — we sent a verification link to <strong>{email}</strong>.
			Click it to activate your account.
		</p>
	{:else}
		<SocialSignIn verb="Register" onError={message => errors = [message]} />
		{#if errors.length > 0}
			<ul class="errors">
				{#each errors as error}
					<li>{error}</li>
				{/each}
			</ul>
		{/if}
		<form onsubmit={e => { e.preventDefault(); submit(); }}>
			<label for="email">
				Email
				<input name="email" id="email" type="email" bind:value={email} required autocomplete="email" />
			</label>
			<label for="password">
				Password <span class="note">(min. 6 characters)</span>
				<input name="password" id="password" type="password" bind:value={password} required minlength="6" autocomplete="new-password" />
			</label>
			<label for="confirm-password">
				Confirm password
				<input name="confirm-password" id="confirm-password" type="password" bind:value={confirmPassword} required autocomplete="new-password" />
			</label>
			<button disabled={submitting}>Register</button>
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

		.sent {
			margin: 0;
			font-size: 0.95rem;
			color: rgba(0, 0, 0, 0.75);
			line-height: 1.5;
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
			button:disabled {
				opacity: 0.7;
			}
		}

	}
</style>
