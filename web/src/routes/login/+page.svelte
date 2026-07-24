<script>
	import { goto } from "$app/navigation"
	import { page } from "$app/state"
	import { authClient } from "$lib/auth-client.js"
	import SocialSignIn from "$lib/components/SocialSignIn.svelte"

	let email = $state("");
	let password = $state("");
	let errors = $state([]);
	let unverified = $state(false);
	let submitting = $state(false);

	const redirectTo = $derived(page.url.searchParams.get("redirect_to") ?? "/my-flashcards");

	const submit = async () => {
		errors = [];
		unverified = false;
		submitting = true;
		const { error } = await authClient.signIn.email({ email, password });
		submitting = false;
		if (!error) {
			await goto(redirectTo, { invalidateAll: true });
			return;
		}
		if (error.status === 403) {
			// signed up but never clicked the verification link
			unverified = true;
		} else {
			errors = [error.message ?? "Invalid email or password"];
		}
	}

	const resendVerification = async () => {
		await authClient.sendVerificationEmail({ email, callbackURL: "/my-flashcards" });
		unverified = false;
		errors = ["Verification email sent — check your inbox"];
	}
</script>

<div class="register-and-login-container">
	<h1>Log in</h1>
	<SocialSignIn verb="Log in" callbackURL={redirectTo} onError={message => errors = [message]} />
	{#if errors.length > 0}
		<ul class="errors">
			{#each errors as error}
				<li>{error}</li>
			{/each}
		</ul>
	{/if}
	{#if unverified}
		<p class="unverified">
			Your email isn't verified yet.
			<button type="button" class="link-btn" onclick={resendVerification}>Resend verification email</button>
		</p>
	{/if}
	<form onsubmit={e => { e.preventDefault(); submit(); }}>
		<label for="email">
			Email
			<input name="email" id="email" type="email" bind:value={email} required autocomplete="email">
		</label>
		<label for="password">
			Password
			<input name="password" id="password" type="password" bind:value={password} required autocomplete="current-password">
		</label>
		<a class="forgot" href="/forgot-password">Forgot password?</a>
		<button type="submit" disabled={submitting}>Log in</button>
	</form>
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

		.errors {
			color: red;
			padding-left: 16px;
			margin: 0 0 12px 0;
			font-size: 0.9rem;
		}

		.unverified {
			margin: 0 0 12px 0;
			font-size: 0.9rem;
			color: rgba(0, 0, 0, 0.7);
		}

		.link-btn {
			border: none;
			background: none;
			padding: 0;
			color: var(--accent);
			text-decoration: underline;
			cursor: pointer;
			font-size: inherit;
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

			.forgot {
				align-self: end;
				margin-top: -6px;
				font-size: 0.85rem;
				color: rgba(0, 0, 0, 0.6);
			}
			.forgot:hover {
				color: black;
			}

			button[type="submit"] {
				margin-top: 8px;
				padding: 10px 0;
				border: 1px solid var(--accent);
				border-radius: 6px;
				background-color: var(--accent);
				color: white;
				font-size: 1rem;
				cursor: pointer;
			}
			button[type="submit"]:hover:enabled {
				background-color: var(--accent-hover);
			}
			button[type="submit"]:disabled {
				opacity: 0.7;
			}
		}

	}
</style>
