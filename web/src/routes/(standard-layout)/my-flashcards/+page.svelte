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
					<td>{deck.due_cards}</td>
					<td>{deck.no_cards}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

<!-- {@render deckTable("Marketplace decks", [])} -->
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
	table {
		padding: 8px;
		border-collapse: collapse;
		margin-top: 12px;
		margin-bottom: 32px;
	}
	th {
		text-align: left;
	}
	tbody td:first-child {
		position: relative;
	}
	tbody > tr:hover {
		background-color: rgba(0, 0, 0, 0.15);
	}
	td {
		padding: 2px 0;
	}
	table a::after {
		content: "";
		position: absolute;
		inset: 0;
	}
	form {
		margin-top: 6px;
	}
</style>

