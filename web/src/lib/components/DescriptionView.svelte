<script>
	import { boardAlignment } from "$lib/side-alignment.js"
	import { ttGenerateHTML } from "$lib/tiptap-utility.js"
	import { countBoards, boardsBefore } from "$lib/card-utils.js"
	import { parseMoveRef, markMoveRefs } from "$lib/tiptap-move-ref.js"
	import Chessboard from "./Chessboard.svelte"

	// A deck description (DescriptionEditor's blocks) shown the way a card
	// shows its back — the card's own board layout (app.css, under .flashcard)
	// without the card around it, and read as a document: from the left edge.
	let { blocks } = $props();

	// moves written in the text drive the board they name, as on a card
	// (FlashcardBrowse)
	let asides = $state({});
	let clicks = 0;
	$effect(() => { void blocks; asides = {} });
	let boardAt = $state({});
	let element = $state();
	$effect(() => { void blocks; markMoveRefs(element, boardAt) });
	const handleTextClick = e => {
		const token = e.target.closest?.("[data-move-ref]");
		if (!token) return;
		const ref = parseMoveRef(token);
		if (ref) asides[ref.board] = { ...ref, nonce: ++clicks };
	}

	let showBoardNumbers = $derived(countBoards(blocks) > 1);
</script>

<div
	class="flashcard description-view"
	data-boards={boardAlignment(blocks) === "center" ? "solo" : null}
	bind:this={element}
>
	<div class="card-side" data-board-align={boardAlignment(blocks)}>
		{#each blocks as block, blockIndex}
			{#if block.type === "text"}
				<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -- the moves inside are pointer targets; the board's own move line is the keyboard's way through a line -->
				<div class="text-block" onclick={handleTextClick}>
					{@html ttGenerateHTML(block.content)}
				</div>
			{:else if block.type === "chessboards"}
				<div
					class={{
						"single-board-block": block.content.length < 2,
						"board-grid-block": block.content.length > 1
					}}
				>
					{#each block.content as chessboard, boardIndex}
						{@const n = boardsBefore(blocks, blockIndex) + boardIndex + 1}
						<div class="board-container">
							<Chessboard
								board={chessboard}
								onBack
								minWidth="280px"
								number={showBoardNumbers ? n : null}
								aside={asides[n]}
								onPosition={at => boardAt[n] = at}
							/>
						</div>
					{/each}
				</div>
			{/if}
		{/each}
	</div>
</div>

<style>
	.description-view {
		margin: 16px 0;
		display: flex;
		flex-direction: column;
	}
	.description-view .card-side,
	.description-view :global(.single-board-block) {
		align-items: flex-start;
	}
</style>
