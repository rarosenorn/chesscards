<script>
	import { enhance } from "$app/forms"
	import { formatCents } from "$lib/money.js"
	import { PAYOUT_CURRENCIES } from "$lib/payout-currencies.js"

	let { payouts, accountEmail, form } = $props();
</script>

<section class="payouts" id="payouts">
	<h2>Payouts</h2>
	<p>
		On the 1st of each month we pay your share of the previous month's sales by Wise, to an
		email: Wise writes to it and you collect the money into your bank account. Under $10 waits
		for the next month.
	</p>
	<p>Earned and not yet paid: <strong>{formatCents(payouts.owedCents)}</strong></p>
	{#if payouts.payouts.length > 0}
		<ul class="history">
			{#each payouts.payouts as payout (payout.id)}
				<li>{payout.month}: {formatCents(payout.amountCents)}{payout.paidAt ? "" : " (being paid)"}</li>
			{/each}
		</ul>
	{/if}
	{#if payouts.email}
		<p>Payouts go to <strong>{payouts.email}</strong>.</p>
	{:else}
		<p>No payout email yet. Your earnings are kept until you add one.</p>
	{/if}
	{#if payouts.pendingEmail}
		<p class="pending">Check {accountEmail} for a link to confirm {payouts.pendingEmail}.</p>
	{/if}
	<form method="POST" action="?/payoutDetails" use:enhance={() => async ({ update }) => update({ reset: false })}>
		<label>
			Payout email
			<input type="email" name="payout-email" required autocomplete="email" value={payouts.email ?? accountEmail} />
		</label>
		<label>
			Name on your bank account
			<input name="payout-name" required maxlength="100" autocomplete="name" value={payouts.name ?? ""} />
		</label>
		<label>
			Your bank account's currency
			<select name="payout-currency" required value={payouts.currency ?? ""}>
				<option value="" disabled>Choose</option>
				{#each PAYOUT_CURRENCIES as currency}
					<option value={currency}>{currency}</option>
				{/each}
			</select>
		</label>
		<p class="hint">USD only for a bank account in the US. Currency not listed? Email us.</p>
		<button class="std-btn">Save</button>
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
	.history {
		margin: 0;
		padding-left: 20px;
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
	input, select {
		border: 1px solid lightgrey;
		border-bottom: 1px solid darkgrey;
		border-radius: 4px;
		padding: 6px 8px;
		width: 260px;
	}
	.hint {
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.55);
	}
	.error {
		color: #c62828;
	}
</style>
