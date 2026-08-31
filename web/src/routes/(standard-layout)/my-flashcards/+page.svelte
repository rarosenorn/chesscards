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
				<th>New</th>
				<th>Learn</th>
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
					<td class="count new" class:none={deck.new_cards == 0}>{deck.new_cards}</td>
					<td class="count learn" class:none={deck.learn_cards == 0}>{deck.learn_cards}</td>
					<td class="count review" class:none={deck.review_cards == 0}>{deck.review_cards}</td>
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
	th:nth-child(n + 2) {
		width: 65px;
	}
	th:nth-child(n + 2),
	td:nth-child(n + 2) {
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
	/* anki's deck browser colours, count by count: blue for new, rust for
	   what is being learned, green for the reviews coming round. Nothing
	   waiting is grey — the colour is the call to study */
	.count {
		font-weight: 500;
	}
	.count.new {
		color: #00a;
	}
	.count.learn {
		color: #c35617;
	}
	.count.review {
		color: #070;
	}
	.count.none {
		color: rgba(0, 0, 0, 0.35);
		font-weight: 400;
	}
	/* section titles, larger than the deck rows they head */
	th:first-child {
		font-size: 1.05rem;
	}
	/* the create field belongs to the deck list it adds to, so it sits
	   closer to it than the two tables sit to each other */
	table:last-of-type {
		margin-bottom: 14px;
	}
	form {
		margin-top: 6px;
	}
</style>

