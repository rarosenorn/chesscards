<script>
	import { enhance } from "$app/forms"
	import FormErrors from "$lib/components/FormErrors.svelte"
	let { data, form } = $props();
</script>

{#snippet deckTable(firstTableHeader, decks)}
	<table>
		<thead>
			<tr>
				<th>{firstTableHeader}</th>
				<th>Due</th>
				<th>Total</th>
			</tr>
		</thead>
		<tbody>
			{#each decks as deck (deck.id)}
				<tr>
					<td><a href={`my-flashcards/${deck.id}/study`}>
							{deck.name}
					</a></td>
					<td class="due">
						{#if deck.due_cards > 0}
							<span class="due-pill">{deck.due_cards}</span>
						{:else}
							{deck.due_cards}
						{/if}
					</td>
					<td>{deck.no_cards}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

{@render deckTable("Marketplace decks", data.marketplaceDecks)}
{@render deckTable("My decks", data.decks)}
<FormErrors form={form} />
<form method="POST" action="?/create" use:enhance>
	<input
		name="name"
		value={form?.name ?? ""}
		required
		minlength="4"
		maxlength="100"
		autocomplete="off"
	/>
	<button>Create</button>
</form>

<style>
	/* fixed shared column widths so both tables' columns line up */
	table {
		padding: 8px;
		border-collapse: collapse;
		margin-top: 12px;
		margin-bottom: 32px;
		table-layout: fixed;
		width: 100%;
	}
	th:nth-child(2),
	th:nth-child(3) {
		width: 110px;
	}
	th:nth-child(2),
	th:nth-child(3),
	td:nth-child(2),
	td:nth-child(3) {
		text-align: center;
	}
	th {
		text-align: left;
	}
	tbody td:first-child {
		padding-left: 4px;
	}
	/* the row-filling link overlay (table a::after) anchors here, making the
	   whole row one click target to match the full-row hover affordance */
	tbody tr {
		position: relative;
	}
	tbody > tr:hover {
		background-color: var(--accent-subtle);
	}
	tbody > tr {
		cursor: pointer;
	}
	td {
		padding: 2px 0;
	}
	/* the row is the affordance (full-row overlay + hover), so the deck name
	   reads as plain text: no link blue, no visited purple, no underline */
	table a {
		color: #404040;
		text-decoration: none;
		font-weight: 500;
	}
	table a::after {
		content: "";
		position: absolute;
		inset: 0;
	}
	/* where's work waiting: due count gets an accent pill, 0 recedes to grey */
	td.due {
		color: rgba(0, 0, 0, 0.45);
	}
	.due-pill {
		display: inline-block;
		background-color: var(--accent-subtle-strong);
		color: var(--accent);
		border-radius: 10px;
		padding: 1px 9px;
		font-size: 0.85rem;
		font-weight: 500;
	}
	/* section titles, larger than the deck rows they head */
	th:first-child {
		font-size: 1.15rem;
	}
	form {
		margin-top: 6px;
	}
</style>

