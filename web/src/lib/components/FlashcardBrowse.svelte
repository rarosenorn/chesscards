<script>
	import { boardAlignment, boardsAllAlone } from "$lib/side-alignment.js"
	import { ttGenerateHTML } from "../tiptap-utility.js"
	import { countBoards, boardsBefore, firstBoardWithMoves, sideHasContent } from "../card-utils.js"
	import Chessboard from "./Chessboard.svelte"
	import { parseMoveRef, markMoveRefs } from "$lib/tiptap-move-ref.js"

	let { card } = $props();

	// A move written in the card's text drives the board it names (see
	// tiptap-move-ref.js): the click is handed to that board by number, and
	// the nonce makes a second click on the same move a second request. One
	// store for the whole card — a board on the front is as nameable from the
	// back's text as from its own side's.
	let asides = $state({});
	let clicks = 0;
	$effect(() => { void card; asides = {} });
	// ...and each board answers with where it now stands, so the move it is
	// showing is marked in the text that named it — an aside is nowhere else
	let boardAt = $state({});
	let cardElement = $state();
	$effect(() => { void card; markMoveRefs(cardElement, boardAt) });
	const handleTextClick = e => {
		const token = e.target.closest?.("[data-move-ref]");
		if (!token) return;
		const ref = parseMoveRef(token);
		if (ref) asides[ref.board] = { ...ref, nonce: ++clicks };
	}

	// where the arrows land: the card's first board that has moves to step
	let focusBoardNumber = $derived(firstBoardWithMoves(card.front, card.back));
	let frontBoardCount = $derived(countBoards(card.front));
	// board numbers are only shown when the card has several boards to reference
	let showBoardNumbers = $derived(frontBoardCount + countBoards(card.back) > 1);
</script>

{#snippet side(side, boardNumberOffset, authorView)}
<div
	class="card-side"
	data-board-align={boardAlignment(side)}
>
	{#each side as block, blockIndex}
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
					<!-- the board's number is what the text calls it by, whether
					     or not the card is showing numbers -->
					{@const n = boardNumberOffset + boardsBefore(side, blockIndex) + boardIndex + 1}
					<div class="board-container">
						<!-- low floor: two squeezed boards must shrink, not overflow
					     their cells and crush the gap between them -->
					<Chessboard
						board={chessboard}
						{authorView}
						minWidth="280px"
						number={showBoardNumbers ? n : null}
						autoFocus={n - 1 === focusBoardNumber}
						aside={asides[n]}
						onPosition={at => boardAt[n] = at}
					/>
					</div>
				{/each}
			</div>
		{/if}
	{/each}
</div>
{/snippet}

<div
	class="flashcard card-surface"
	data-boards={boardsAllAlone(card) ? "solo" : null}
	bind:this={cardElement}
>
	{@render side(card.front, 0, true)}
	<!-- the divider only when the back has VISIBLE content — a card whose
	     answer lives on the front boards' back layers gets no delimiter -->
	{#if sideHasContent(card.back)}
		<div class="side-gap"></div>
	{/if}
	{@render side(card.back, frontBoardCount, false)}
</div>

<style>
	/* board/text layout inside the card comes from app.css ("card board
	   layout"), shared with the study page */
	.flashcard {
		align-items: center;
		margin-top: 32px;
		margin-bottom: 40px;
		/* the same floor the study card keeps, so a card does not change
		   size between the two views */
		min-height: calc(var(--solo-board-size) + var(--card-stack) - var(--grade-row));
		/* the card's rim, a little wider than the divider's 18px between the
		   sides — same relation as on the study card */
		padding: 24px 37px;
	}
</style>
