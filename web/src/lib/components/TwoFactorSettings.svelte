<script>
	import { invalidateAll } from "$app/navigation"
	import { renderSVG } from "uqr"
	import { authClient } from "$lib/auth-client.js"

	let { enabled, verified } = $props();

	let step = $state("idle");
	let password = $state("");
	let code = $state("");
	let error = $state("");
	let busy = $state(false);
	let setup = $state(null);

	const qrSvg = $derived(setup ? renderSVG(setup.totpURI) : "");
	const secret = $derived(setup ? new URL(setup.totpURI).searchParams.get("secret") : "");

	const reset = () => {
		step = "idle";
		password = "";
		code = "";
		error = "";
		setup = null;
	};

	const run = async action => {
		error = "";
		busy = true;
		try {
			await action();
		} finally {
			busy = false;
		}
	};

	const start = () => run(async () => {
		const { data, error: err } = await authClient.twoFactor.enable({ password });
		if (err) {
			error = err.code === "INVALID_PASSWORD" ? "Wrong password" : err.message ?? "Couldn't start the setup";
			return;
		}
		setup = data;
		password = "";
		step = "scan";
	});

	const confirm = () => run(async () => {
		const { error: err } = await authClient.twoFactor.verifyTotp({ code: code.trim() });
		if (err) {
			error = "Wrong code";
			return;
		}
		reset();
		await invalidateAll();
	});

	const turnOff = () => run(async () => {
		const { error: err } = await authClient.twoFactor.disable({ password });
		if (err) {
			error = err.code === "INVALID_PASSWORD" ? "Wrong password" : err.message ?? "Couldn't turn it off";
			return;
		}
		reset();
		await invalidateAll();
	});
</script>

<section id="two-factor" class="two-factor">
	<h2>Two-factor login</h2>
	{#if enabled && step === "idle"}
		{#if verified}
			<p>On. Logging in with your email and password also asks for a code from your authenticator app.</p>
		{:else}
			<p>
				On, but this session was opened without a code, so admin is locked. Log out and log in
				with your email, password and code to use admin.
			</p>
		{/if}
		<button class="quiet-btn" onclick={() => step = "off"}>Turn off</button>
	{:else if enabled && step === "off"}
		<form onsubmit={e => { e.preventDefault(); turnOff(); }}>
			<label>
				Password
				<input type="password" bind:value={password} required autocomplete="current-password">
			</label>
			<div class="row">
				<button class="danger-btn" disabled={busy}>Turn off</button>
				<button type="button" class="quiet-btn" onclick={reset}>Cancel</button>
			</div>
		</form>
	{:else if step === "idle"}
		<p>Admin needs two-factor login: each login with your email and password also asks for a code from an authenticator app.</p>
		<button class="std-btn" onclick={() => step = "password"}>Set up</button>
	{:else if step === "password"}
		<form onsubmit={e => { e.preventDefault(); start(); }}>
			<label>
				Password
				<input type="password" bind:value={password} required autocomplete="current-password">
			</label>
			<div class="row">
				<button class="std-btn" disabled={busy}>Continue</button>
				<button type="button" class="quiet-btn" onclick={reset}>Cancel</button>
			</div>
		</form>
	{:else if step === "scan"}
		<form onsubmit={e => { e.preventDefault(); confirm(); }}>
			<p>Scan this with your authenticator app, or enter the key by hand.</p>
			<div class="qr">{@html qrSvg}</div>
			<code class="secret">{secret}</code>
			<p>Backup codes: each logs you in once without the app. Save them somewhere safe; they aren't shown again.</p>
			<ul class="backup-codes">
				{#each setup.backupCodes as backupCode}
					<li><code>{backupCode}</code></li>
				{/each}
			</ul>
			<label>
				Code from the app
				<input
					bind:value={code}
					required
					autocomplete="one-time-code"
					inputmode="numeric"
				>
			</label>
			<div class="row">
				<button class="std-btn" disabled={busy}>Turn on</button>
				<button type="button" class="quiet-btn" onclick={reset}>Cancel</button>
			</div>
		</form>
	{/if}
	{#if error}
		<p class="error">{error}</p>
	{/if}
</section>

<style>
	.two-factor {
		margin-top: 26px;
		padding-top: 16px;
		border-top: 1px solid rgba(0, 0, 0, 0.1);
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 10px;
		font-size: 0.95rem;
		color: rgba(0, 0, 0, 0.75);
	}
	h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: rgba(0, 0, 0, 0.85);
	}
	p {
		margin: 0;
		max-width: 60ch;
	}
	form {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 10px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	input {
		border: 1px solid lightgrey;
		border-bottom: 1px solid darkgrey;
		border-radius: 4px;
		padding: 6px 8px;
		width: 260px;
	}
	.row {
		display: flex;
		gap: 8px;
	}
	.qr {
		width: 180px;
		height: 180px;
	}
	.qr :global(svg) {
		width: 100%;
		height: 100%;
	}
	.secret {
		font-size: 0.85rem;
		word-break: break-all;
	}
	.backup-codes {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		grid-template-columns: repeat(2, auto);
		gap: 4px 24px;
	}
	.error {
		color: #c00;
		font-size: 0.9rem;
	}
	.quiet-btn {
		padding: 7px 16px;
		border-radius: 5px;
		background-color: transparent;
		border: 1px solid rgba(0, 0, 0, 0.25);
		color: rgba(0, 0, 0, 0.7);
		cursor: pointer;
	}
	.quiet-btn:hover {
		border-color: rgba(0, 0, 0, 0.5);
		color: black;
	}
	.danger-btn {
		padding: 7px 16px;
		border-radius: 5px;
		background-color: transparent;
		border: 1px solid #c62828;
		color: #c62828;
		cursor: pointer;
	}
	.danger-btn:hover {
		background-color: #c62828;
		color: white;
	}
</style>
