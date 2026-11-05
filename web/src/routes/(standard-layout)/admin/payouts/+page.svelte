<script>
	import { enhance } from "$app/forms"
	import FormErrors from "$lib/components/FormErrors.svelte"
	import { formatCents } from "$lib/money.js"

	let { data, form } = $props();

	const payable = $derived(data.due.filter(row => !row.rollsOver));
	const date = value => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
</script>

<p><a href="/admin">Upload requests</a></p>

<h2>Due for sales up to the end of {data.month}</h2>
{#if data.due.length === 0}
	<p>Nothing is owed.</p>
{:else}
	<table>
		<thead>
			<tr>
				<th>Author</th>
				<th>Payout to</th>
				<th>Sales</th>
				<th>Earned</th>
				<th>Refunds</th>
				<th>Total</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.due as row (row.authorId)}
				<tr class:rolls-over={row.rollsOver}>
					<td>{row.author ?? "?"}{row.deleted ? " (deleted)" : ""}</td>
					<td>
						{#if row.email}
							{row.name}, {row.email}, {row.currency}
							{#if row.emailChanged}<span class="flag">email changed since last payout</span>{/if}
							{#if row.firstPayout}<span class="flag">first payout</span>{/if}
						{/if}
					</td>
					<td>{row.sales}</td>
					<td>{formatCents(row.earned)}</td>
					<td>{row.refunds ? `−${formatCents(row.refunds)}` : ""}</td>
					<td>{formatCents(row.total)}</td>
					<td>{row.rollsOver ? `Rolls over: ${row.rollsOver}` : ""}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	{#if payable.length > 0}
		<form method="POST" action="?/prepare" use:enhance>
			<button class="std-btn">
				Prepare {payable.length} payout{payable.length === 1 ? "" : "s"}: {formatCents(payable.reduce((sum, row) => sum + row.total, 0))}
			</button>
		</form>
	{/if}
{/if}
<FormErrors {form} />

<h2>Prepared</h2>
{#if data.prepared.length === 0}
	<p>None.</p>
{:else}
	<table>
		<thead>
			<tr><th>Author</th><th>Payout to</th><th>Amount</th><th></th></tr>
		</thead>
		<tbody>
			{#each data.prepared as payout (payout.id)}
				<tr>
					<td>{payout.author ?? "?"}</td>
					<td>{payout.name}, {payout.email}, {payout.currency}</td>
					<td>{formatCents(payout.amountCents)}</td>
					<td>
						<form method="POST" action="?/cancel" use:enhance>
							<input type="hidden" name="id" value={payout.id}>
							<button class="std-btn">Cancel</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p class="steps">
		Download the batch file, upload it in Wise (Payments, Batch payments) and pay it there; then mark the payouts paid, which emails each author.
	</p>
	<div class="actions">
		<a class="std-btn" href="/admin/payouts/wise.csv" download>Download Wise batch file</a>
		<form method="POST" action="?/paid" use:enhance>
			<button class="std-btn">Mark {data.prepared.length} paid</button>
		</form>
	</div>
{/if}

<h2>Paid</h2>
{#if data.paid.length === 0}
	<p>None yet.</p>
{:else}
	<table>
		<thead>
			<tr><th>Paid</th><th>Author</th><th>Payout to</th><th>Amount</th><th></th></tr>
		</thead>
		<tbody>
			{#each data.paid as payout (payout.id)}
				<tr>
					<td>{date(payout.paidAt)}</td>
					<td>{payout.author ?? "?"}</td>
					<td>{payout.name}, {payout.email}, {payout.currency}</td>
					<td>{formatCents(payout.amountCents)}</td>
					<td>
						<form method="POST" action="?/cancel" use:enhance>
							<input type="hidden" name="id" value={payout.id}>
							<button class="std-btn">Undo</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p class="steps">Undo a payout Wise couldn't deliver: its sales are owed again.</p>
{/if}

<style>
	h2 {
		font-size: 1.2rem;
		margin: 28px 0 12px 0;
	}
	table {
		border-collapse: collapse;
		margin-bottom: 12px;
	}
	th {
		text-align: left;
	}
	th, td {
		padding: 4px 24px 4px 0;
	}
	tbody > tr:hover {
		background-color: rgba(0, 0, 0, 0.05);
	}
	.rolls-over {
		color: rgba(0, 0, 0, 0.5);
	}
	.flag {
		margin-left: 6px;
		padding: 1px 6px;
		border-radius: 3px;
		background-color: #fff7e0;
		font-size: 0.8rem;
	}
	.steps {
		max-width: 70ch;
		color: rgba(0, 0, 0, 0.6);
		font-size: 0.9rem;
	}
	.actions {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.actions a {
		text-decoration: none;
		color: inherit;
	}
</style>
