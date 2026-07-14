<script>
	import TextEditor from "$lib/components/TextEditor.svelte"
	import Chessboard from "$lib/components/Chessboard.svelte"
	import ChessboardEditor from "$lib/components/ChessboardEditor.svelte"
	import CrossIcon from "$lib/icons/Cross.svelte"
	import { boardsBefore, newBoard } from "$lib/card-utils.js"

	let { side, boardNumberOffset = 0, showBoardNumbers = false } = $props();

	export const hasOpenEditors = () => editingBoards.length > 0;

	const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

	// { blockId, boardIndex } of every board currently open in an editor
	let editingBoards = $state([]);

	const isEditing = (blockId, boardIndex) =>
		editingBoards.some(e => e.blockId === blockId && e.boardIndex === boardIndex);

	const openEditor = (blockId, boardIndex) => {
		if (!isEditing(blockId, boardIndex)) editingBoards.push({ blockId, boardIndex });
	}

	const closeEditor = (blockId, boardIndex) => {
		editingBoards = editingBoards.filter(
			e => !(e.blockId === blockId && e.boardIndex === boardIndex)
		);
	}

	const addTextBlock =
		() => side.push({ id: crypto.randomUUID(), type: "text", textEditor: null });

	const addChessboardBlock = () => {
		const id = crypto.randomUUID();
		side.push({
			id,
			type: "chessboards",
			content: [newBoard(startFen)]
		});
		openEditor(id, 0);
	}

	const addChessboard = blockIndex => {
		side[blockIndex].content.push(newBoard(startFen));
		openEditor(side[blockIndex].id, side[blockIndex].content.length - 1);
	}

	const deleteBlock = blockIndex => {
		const blockId = side[blockIndex].id;
		editingBoards = editingBoards.filter(e => e.blockId !== blockId);
		side.splice(blockIndex, 1);
	}
	// If board is last board in block, delete block

	const duplicateChessboard = (blockIndex, boardIndex) => {
		const blockId = side[blockIndex].id;
		// deep copy so the duplicate's moves/annotations are independent
		side[blockIndex].content.splice(
			boardIndex + 1, 0, $state.snapshot(side[blockIndex].content[boardIndex])
		);
		// keep open editors on the same boards after their indices shift
		editingBoards = editingBoards.map(e =>
			e.blockId === blockId && e.boardIndex > boardIndex
				? { ...e, boardIndex: e.boardIndex + 1 }
				: e
		);
	}

	const deleteChessboard = (blockIndex, boardIndex) => {
		const blockId = side[blockIndex].id;
		if (side[blockIndex].content.length === 1) {
			deleteBlock(blockIndex);
		} else {
			side[blockIndex].content.splice(boardIndex, 1);
			editingBoards = editingBoards
				.filter(e => !(e.blockId === blockId && e.boardIndex === boardIndex))
				.map(e =>
					e.blockId === blockId && e.boardIndex > boardIndex
						? { ...e, boardIndex: e.boardIndex - 1 }
						: e
				);
		}
	}
</script>

{#each side as block, blockIndex (block.id)}
	<div class="block">
		<button
			class="delete-entity-btn delete-entity-btn-on-line"
			onclick={() => deleteBlock(blockIndex)}
		>
			<CrossIcon />
		</button>
		{#if block.type === "text"}
			<div class="text-block">
				<TextEditor bind:this={block.textEditor} content={block.content} />
			</div>
		{:else if block.type === "chessboards"}
			<div
				class={{
					"single-board-block": block.content.length < 2,
						"board-grid-block": block.content.length > 1
				}}
			>
				{#each block.content as board, boardIndex}
					{#each boardIndex % 2 === 0 ? [boardIndex, boardIndex + 1] : [] as editorIndex}
						{#if editorIndex < block.content.length && isEditing(block.id, editorIndex)}
							{#key block.content[editorIndex]}
								<div class="board-container board-container-editing">
									{#if showBoardNumbers}
										<p class="board-number">
											{boardNumberOffset + boardsBefore(side, blockIndex) + editorIndex + 1}
										</p>
									{/if}
									<ChessboardEditor
										board={block.content[editorIndex]}
										onSave={newBoardData => {
											block.content[editorIndex] = newBoardData;
											closeEditor(block.id, editorIndex);
										}}
										onCancel={() => closeEditor(block.id, editorIndex)}
									/>
								</div>
							{/key}
						{/if}
					{/each}
					{#if !isEditing(block.id, boardIndex)}
						<div class="board-container">
							{#if showBoardNumbers}
								<p class="board-number">
									{boardNumberOffset + boardsBefore(side, blockIndex) + boardIndex + 1}
								</p>
							{/if}
							<div class="board-area">
								<button
									class="delete-entity-btn delete-entity-btn-inside"
									onclick={() => deleteChessboard(blockIndex, boardIndex)}
								>
									<CrossIcon />
								</button>
								<Chessboard {board} flushBottom minWidth={block.content.length < 2 ? "450px" : "409px"} />
							</div>
							<div class="button-row">
								<input
									style="flex-grow: 1;"
									bind:value={block.content[boardIndex].fen}
									disabled={board.moves.length > 0}
									title={board.moves.length > 0 ? "Open the editor to change a board with moves" : ""}
								/>
								<button
									style="padding: 3px 16px;"
									onclick={() => duplicateChessboard(blockIndex, boardIndex)}
								>
									Duplicate
								</button>
								<button
									style="padding: 3px 16px;"
									onclick={() => openEditor(block.id, boardIndex)}
								>
									Edit
								</button>
							</div>
						</div>
					{/if}
				{/each}
			</div>
			<button
				class="white-btn add-chessboard-btn"
				onclick={() => addChessboard(blockIndex)}
			>
				+ Chessboard
			</button>
		{/if}
	</div>
{/each}
<div class="add-block-container">
	<button
		class="white-btn"
		onclick={addChessboardBlock}
	>
		+ Chessboard block
	</button>
	<button
		class="white-btn"
		onclick={addTextBlock}
	>
		+ Text
	</button>
</div>

<style>
	.block {
		display: flex;
		flex-direction: column;
		border: 1px solid transparent;
		padding: 0 10px 10px 10px;
		position: relative;

	}
	.block:hover {
		border: 1px solid rgba(0, 0, 0, 0.2);
	}
	.delete-entity-btn {
		position: absolute;
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: gainsboro;
		border: 1px solid black;
		height: 21px;
		width: 21px;
		cursor: pointer;
		border-radius: 4px;
		z-index: 1;
	}
	.delete-entity-btn-inside {
		top: 3px;
		right: 3px;
	}
	.delete-entity-btn-on-line {
		top: -10px;
		right: -10px;
	}
	@media (hover: hover) {
		.delete-entity-btn {
			opacity: 0
		}
	}
	.delete-entity-btn:hover {
		background-color: darkgrey;
	}
	.block:hover > .delete-entity-btn {
		opacity: 1;
	}
	.text-block {
		display: flex;
		justify-content: start;
		position: relative;
		padding-top: 10px;
	}
	.single-board-block {
		display: flex;
		position: relative;
		flex-direction: column;
		align-items: center;
		padding-top: 10px;
	}
	.board-grid-block {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		grid-auto-flow: dense;
		gap: 20px;
		position: relative;
		padding-top: 10px;
	}
	.board-container {
		position: relative;
		display: flex;
		flex-direction: column;
	}
	.board-container > .button-row {
		margin: 2px 0 0 0;
	}
	.board-container > .button-row > * {
		border-radius: 0;
	}
	.board-container > .button-row > input:focus {
		position: relative;
		z-index: 1;
	}
	.board-container:hover .delete-entity-btn {
		opacity: 1;
	}
	.board-area {
		position: relative;
		display: flex;
		flex-direction: column;
	}
	.board-container-editing {
		grid-column: 1 / -1;
		width: 100%;
	}
	.add-chessboard-btn {
		align-self: end;
		margin-top: 24px;
	}
	.add-block-container {
		margin: 16px 0;
		display: flex;
		justify-content: center;
		gap: 16px;
	}
</style>
