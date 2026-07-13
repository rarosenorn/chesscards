<script>
	// TODO ?(if a chessboard block is not the last on the side, add + Chessboard button to that block, so you can still add chessboards to itwithout dragging)
	// TODO do so all chessboards on a card (both front and back) has numbers (D. 1? D. for diagram) or just 1?) incrementally automatically for referencing
	// TODO change tabulation to go only between text fields (maybe edit chessboards?) and add card button
	// TODO svelte-dnd-action library for dragging and dropping
	// TODO drag blocks around to reorder
	// TODO drag chessboards around inside chessboard block to reorder (also to other chessboard blocks?)
	// TODO edit chessboard button to show chessboard editor for that board
	import { onMount, tick } from "svelte"
	import { enhance, applyAction } from "$app/forms"
	import { isValidFen } from "$lib/isValidFen.js"
	import TextEditor from "$lib/components/TextEditor.svelte"
	import Chessboard from "$lib/components/Chessboard.svelte"
	import CrossIcon from "$lib/icons/Cross.svelte"

	let { data } = $props();
	const getInitialSideState = () => [{ id: crypto.randomUUID(), type: "text", textEditor: null	}]
	let front = $state(getInitialSideState())
	let back = $state(getInitialSideState())

	// Card is valid if it has atleast 1 non-empty text field or 1 chessboard
	let cardIsValid = $derived(
		front.some(element => 
			(element.type === "text" && !element.textEditor.isEmpty()) ||
			(element.type === "chessboards" && element.content.length > 0)
		)
	)
	let formAttemptedAndInvalid = $state(false);
	$effect(() => { if (cardIsValid) formAttemptedAndInvalid = false })

	const addTextBlock = 
		side => side.push({ id: crypto.randomUUID(), type: "text", textEditor: null });

	const addChessboardBlock = (side) => {
			side.push({ 
				id: crypto.randomUUID(), 
				type: "chessboards", 
				content: ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"] 
			});
	}

	const addChessboard = (side, blockIndex) => {
		side[blockIndex].content.push(
				"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
		);
	}

	const deleteBlock = 
		(side, blockIndex) => side.splice(blockIndex, 1);
	// If board is last board in block, delete block

	const deleteChessboard = (side, blockIndex, boardIndex) => {
		if (side[blockIndex].content.length === 1) {
			deleteBlock(side, blockIndex);
		} else {
			side[blockIndex].content.splice(boardIndex, 1);
		}
	}

	const getSideJson = side => {
		let sideForJson = side.map(block => ({ 
			type: block.type,
			content: 
				block.type === "text" ? block.textEditor.getJson() : 
				block.type === "chessboards" ? block.content : null
		}))
		return JSON.stringify(sideForJson)
	}

	// bound to addCardForm element
	let addCardForm;

	const handleKeyDown = e => {
		if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
			e.preventDefault();
			addCardForm.requestSubmit();
		}
	}

	onMount(() => {
		// set first front editor to focus on page load
		front[0].textEditor.focus();
	})
</script>

<svelte:window onkeydown={handleKeyDown} />

{#snippet cardSide(side)}
	{#each side as block, blockIndex (block.id)}
		<div class="block">
			<button 
				class="delete-entity-btn delete-entity-btn-on-line"
				onclick={() => deleteBlock(side, blockIndex)}
			>
				<CrossIcon />
			</button>
			{#if block.type === "text"}
				<div class="text-block">
					<TextEditor bind:this={block.textEditor} />
				</div>
			{:else if block.type === "chessboards"}
				<div 
					class={{
						"single-board-block": block.content.length < 2,
							"board-grid-block": block.content.length > 1
					}}
				>
					{#each block.content as board, boardIndex}
						<div class="board-container">
							<button 
								class="delete-entity-btn delete-entity-btn-inside"
								onclick={() => deleteChessboard(side, blockIndex, boardIndex)}
							>
								<CrossIcon />
							</button>
							<Chessboard fen={board} />
							<div class="button-row">
								<input style="flex-grow: 1;" bind:value={block.content[boardIndex]} />
								<button style="padding: 3px 16px;">Edit</button>
							</div>
						</div>
					{/each}
				</div>
				<button 
					class="white-btn add-chessboard-btn"
					onclick={() => addChessboard(side, blockIndex)}
				>
					+ Chessboard
				</button>
			{/if}
		</div>
	{/each}
	<div class="add-block-container">
		<button 
			class="white-btn"
			onclick={() => addChessboardBlock(side)}
		>

			+ Chessboard block
		</button>
		<button 
			class="white-btn"
			onclick={() => addTextBlock(side)} 
		>
			+ Text
		</button>
	</div>
{/snippet}

<div class="container">
	<p class="side-indicator">Front</p>
	{#if formAttemptedAndInvalid}
	<p style="color: red; margin-left: 16px; margin-top: 4px; margin-bottom: 4px;" >Front must have atleast 1 non-empty text field or 1 chessboard</p>
	{/if}
	{@render cardSide(front)}
	<p class="side-indicator" style="margin-top: 10px;">Back</p>
	{@render cardSide(back)}
	<form 
		bind:this={addCardForm}
		class="add-form"
		method="POST" 
		use:enhance={({ formData, cancel }) => {
			if (!cardIsValid) {
				formAttemptedAndInvalid = true;
				cancel();
			} 

			formData.set("front", getSideJson(front));
			formData.set("back", getSideJson(back));

			return async ({ update }) => {
				await update()
				front = getInitialSideState();
				back = getInitialSideState();
				await tick();
				front[0].textEditor.focus();
			}
		}}
	>	
		<button 
			class="std-btn" 
			title="ctrl+enter"
		>
			Add card
		</button>
	</form>
</div>

<style>
	.container {
		border-radius: 4px;
		width: 900px;
		margin: auto;
		margin-bottom: 80px;
		margin-top: 34px;
		padding: 12px 20px;
		background-color: white;
		display: flex;
		flex-direction: column;
		box-shadow: rgba(60, 64, 67, 0.3) 0px 1px 2px 0px, rgba(60, 64, 67, 0.15) 0px 2px 6px 2px;
	}
	.side-indicator {
		margin-left: 14px;
		margin-bottom: 0px;
		font-size: 1.12rem;
		align-self: start;
	}
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
		gap: 20px;
		position: relative;
		padding-top: 10px;
	}
	.board-container {
		position: relative;
	}
	.board-container:hover > .delete-entity-btn {
		opacity: 1;
	}
	.add-chessboard-btn {
		align-self: end; 
		margin-top: 12px;
	}
	.add-block-container {
		margin: 16px 0; 
		display: flex; 
		justify-content: center; 
		gap: 16px;
	}
	.add-form {
		align-self: end;
	}
	.std-btn {
		margin-right: 10px;
	}
</style>
