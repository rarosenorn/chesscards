<script>
	// TODO paneforge for reziing with slit
	// TODO align paragraph depending on lines
	// if single line: center 
	// if multiple line: left align
	// if more than 1 text editor and differing multi and single line: ?
	// TODO menu table arrow shortcut navigation with enter
	// TODO responsive ideas: medium deck table stacked on card table
	// small (phone) only deck and card table stacked, selected card in popover

	import { getContext } from "svelte"
	import FlashcardBrowse from "$lib/components/FlashcardBrowse.svelte"
	import { ttGenerateText } from "$lib/tiptap-utility.js"

	let deck = getContext("deck");
	let selectedCard = $derived(deck.cards[0]);

	const getFrontIndicator = front => {
		for (let i = 0; i < front.length; i++) {
			if (front[i].type === "text") {
				const ttGeneratedText = ttGenerateText(front[i].content);
				if (ttGeneratedText.length > 0) return ttGeneratedText;
			}
			if (i === front.length - 1 && front[i].type === "chessboards") {
				return front[i].content.length > 1 ? "{{chessboards}}" : "{{chessboard}}";
			}
		}
	}

	const handleTableNav = async e => {
		if (e.key === "ArrowUp") {
			e.preventDefault();
			selectedCard = 
				deck.cards[Math.max(deck.cards.indexOf(selectedCard) - 1, 0)]
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			selectedCard = 
				deck.cards[Math.min(
					deck.cards.indexOf(selectedCard) + 1, deck.cards.length - 1
				)]
		}
	}
</script>

<div class="container">
	<div class="table-container">
		<table
			role="grid"
			tabindex="0"
			onkeydown={handleTableNav}
			autofocus
		>
			<thead>
				<tr>
					<th>Card</th>
				</tr>
			</thead>
			<tbody>
				{#each deck.cards as card (card.id)}
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
			<FlashcardBrowse card={selectedCard} />
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
		width: 450px;
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
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.selected-card-container {
		flex-grow: 1;
		min-width: 0;
	}
</style>
