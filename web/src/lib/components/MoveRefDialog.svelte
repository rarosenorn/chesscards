<script>
	import { onMount } from "svelte"
	import { replayMoves, moveLabel } from "$lib/board-utils.js"
	import { parseAside, moveRefContent } from "$lib/tiptap-move-ref.js"

	// Writes moves into the card's text that are wired to one of its boards
	// (tiptap-move-ref.js). A move already on a board's line and an aside that
	// leaves it are the same thing here: pick the board, pick the position the
	// moves follow from, type them.
	// `boards` is the card's boards in reading order, [{ number, fen, moves }].
	let { boards, onInsert, onClose } = $props();

	// svelte-ignore state_referenced_locally -- the panel is built fresh each time it opens
	let boardNumber = $state(boards[0]?.number ?? 1);
	let chosen = $derived(boards.find(b => b.number === boardNumber) ?? boards[0]);
	let replay = $derived(chosen ? replayMoves(chosen) : { fens: [], moveInfos: [] });
	// null follows the end of the line — where the board itself leaves off,
	// and what an aside is usually written against; a shorter line under a
	// board switch clamps rather than pointing past its own end
	let from = $state(null);
	let fromPly = $derived(Math.min(from ?? replay.moveInfos.length, replay.moveInfos.length));
	let text = $state("");
	let parsed = $derived(parseAside(replay.fens[fromPly] ?? "", text));
	let ready = $derived(parsed.moves.length > 0 && !parsed.error);
	// the moves as they will read in the text, numbered from where they branch
	let preview = $derived(parsed.infos.map(moveLabel).join(" "));

	let input = $state();
	onMount(() => input?.focus());

	const insert = () => {
		if (!ready) return;
		onInsert(moveRefContent({
			board: boardNumber,
			from: fromPly,
			moves: parsed.moves,
			infos: parsed.infos,
			line: replay.moveInfos.map(info => info.san)
		}));
	}

	const handleKeydown = e => {
		if (e.key === "Enter") {
			e.preventDefault();
			insert();
		} else if (e.key === "Escape") {
			e.preventDefault();
			onClose();
		}
	}
</script>

<!-- the panel hears Escape and Enter for the field inside it, which is where
     focus lands; it is not a focus stop itself -->
<div class="move-dialog" role="dialog" aria-label="Insert moves" tabindex="-1" onkeydown={handleKeydown}>
	<div class="row">
		{#if boards.length > 1}
			<label>
				Board
				<select bind:value={boardNumber}>
					{#each boards as board}
						<option value={board.number}>{board.number}</option>
					{/each}
				</select>
			</label>
		{/if}
		<label>
			After
			<select bind:value={from}>
				<option value={null}>the line's end</option>
				<option value={0}>the start position</option>
				{#each replay.moveInfos as info, i}
					<option value={i + 1}>{moveLabel(info, 0)}</option>
				{/each}
			</select>
		</label>
	</div>
	<div class="row">
		<!-- svelte-ignore a11y_autofocus -->
		<input
			bind:this={input}
			bind:value={text}
			type="text"
			placeholder="Nf6 Bd3 e6"
			spellcheck="false"
			aria-label="Moves"
		/>
		<button class="insert-btn" onclick={insert} disabled={!ready}>Insert</button>
		<button class="cancel-btn" onclick={onClose}>Cancel</button>
	</div>
	<!-- one line under the field, always there so the panel does not jump:
	     what the text will say, or the move that does not play from here -->
	<p class="note" class:error={!!parsed.error}>
		{#if parsed.error}
			{parsed.error} cannot be played from there
		{:else if preview}
			{preview}
		{:else}
			Moves from that position, numbers optional
		{/if}
	</p>
</div>

<style>
	/* hangs under the menu bar, over the editor below it */
	.move-dialog {
		position: absolute;
		top: 100%;
		left: 0;
		z-index: 5;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.2);
		border-radius: 3px;
		box-shadow: rgba(0, 0, 0, 0.12) 0 4px 12px;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font-size: 0.9rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	input {
		width: 260px;
		padding: 3px 6px;
		font-size: 0.9rem;
	}
	.insert-btn,
	.cancel-btn {
		padding: 3px 10px;
	}
	.note {
		margin: 0;
		min-height: 1.2em;
		color: rgba(0, 0, 0, 0.55);
	}
	.note.error {
		color: #c0392b;
	}
</style>
