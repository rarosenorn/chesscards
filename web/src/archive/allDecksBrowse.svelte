<script>
	// TODO paneforge for reziing with slit
	// TODO align paragraph depending on lines
	// if single line: center 
	// if multiple line: left align
	// if more than 1 text editor and differing multi and single line: ?
	// TODO menu table arrow shortcut navigation with enter
	// TODO responsive ideas: medium deck table stacked on card table
	// small (phone) only deck and card table stacked, selected card in popover
	import Flashcard from "$lib/components/Flashcard.svelte"
	import { ttGenerateText } from "$lib/tiptap-utility.js"
	let { data } = $props();

	let selectedDeck = $state(data.decks.find(d => d.id === data.deckId));
	let selectedCard = $derived(selectedDeck.cards[0]);

	const getFrontIndicator = front => {
		for (let i = 0; i < front.length; i++) {
			if (front[i].type === "text") {
				return ttGenerateText(front[i].content);
			}
			if (i === front.length - 1 && front[i].type === "chessboards") {
				return front[i].content.length > 1 ? "{{chessboards}}" : "{{chessboard}}";
			}
		}
	}
	$inspect(selectedDeck.cards);
</script>

<div class="container">
	<div class="table-container">
		<table>
			<thead>
				<tr>
					<th>Deck</th>
				</tr>
			</thead>
			<tbody>
				{#each data.decks as deck (deck.id)}
					<tr>
						<td
							class:active={deck.id === selectedDeck.id}
							onclick={() => selectedDeck = deck}
						>
							{deck.name}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="table-container">
		<table>
			<thead>
				<tr>
					<th>Card</th>
				</tr>
			</thead>
			<tbody>
				{#each selectedDeck.cards as card (card.id)}
					<tr onclick={() => selectedCard = card}>
						<td class:active={card.id === selectedCard.id}>
							{getFrontIndicator(card.front)}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="selected-card-container">
		{#if selectedCard}
			<Flashcard card={selectedCard} />
		{/if}
	</div>
</div>

<style>
	.container {
		display: flex;
	}
	.table-container {
		border: 1px solid black;
		height: calc(100vh - 73.4333px - 2px - 23px);
		width: 350px;
		flex-shrink: 0;
		overflow-x: hidden;
		overflow-y: scroll;
	}
	.table-container > table {
		table-layout: fixed;
		width: 100%;
		border-collapse: collapse;
	}
	tr {
		cursor: pointer;
	}
	.active {
		background-color: #bfd9ff;
	}
	td:hover {
		background-color: #b3d9ff;
	}
	tr:nth-child(even) {
		background-color: rgba(0, 0, 0, 0.07);
	}
	td {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.selected-card-container {
		flex-grow: 1;
		min-width: 0;
	}
</style>

