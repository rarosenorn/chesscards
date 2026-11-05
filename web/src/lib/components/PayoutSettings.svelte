<script>
	import { enhance } from "$app/forms"

	let { payouts, accountEmail, form } = $props();
</script>

<section class="payouts" id="payouts">
	<h2>Payouts</h2>
	<p>
		Your marketplace earnings are paid on the 1st of each month by Wise, to an email:
		Wise writes to it and you collect the money into your bank account.
	</p>
	{#if payouts.email}
		<p>Payouts go to <strong>{payouts.email}</strong>.</p>
	{:else}
		<p>No payout email yet. Your earnings are kept until you add one.</p>
	{/if}
	{#if payouts.pendingEmail}
		<p class="pending">Check {accountEmail} for a link to confirm {payouts.pendingEmail}.</p>
	{/if}
	<form method="POST" action="?/payoutEmail" use:enhance>
		<input
			type="email"
			name="payout-email"
			required
			autocomplete="email"
			value={payouts.email ?? accountEmail}
			aria-label="Payout email"
		/>
		<button class="std-btn">{payouts.email ? "Change" : "Save"}</button>
	</form>
	{#if form?.failed === "payout"}
		<p class="error">{form.errors[0]}</p>
	{/if}
</section>

<style>
	.payouts {
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
		gap: 8px;
	}
	input {
		border: 1px solid lightgrey;
		border-bottom: 1px solid darkgrey;
		border-radius: 4px;
		padding: 6px 8px;
		width: 260px;
	}
	.error {
		color: #c62828;
	}
</style>
