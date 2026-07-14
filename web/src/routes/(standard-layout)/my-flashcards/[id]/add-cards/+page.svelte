<script>
	// TODO ?(if a chessboard block is not the last on the side, add + Chessboard button to that block, so you can still add chessboards to itwithout dragging)
	// TODO do so all chessboards on a card (both front and back) has numbers (D. 1? D. for diagram) or just 1?) incrementally automatically for referencing
	// TODO change tabulation to go only between text fields (maybe edit chessboards?) and add card button
	// TODO svelte-dnd-action library for dragging and dropping
	// TODO drag blocks around to reorder
	// TODO drag chessboards around inside chessboard block to reorder (also to other chessboard blocks?)
	import { onMount, tick } from "svelte"
	import { enhance, applyAction } from "$app/forms"
	import CardSideEditor from "$lib/components/CardSideEditor.svelte"
	import { getSideJson, sideHasContent, countBoards } from "$lib/card-utils.js"

	let { data } = $props();
	const getInitialSideState = () => [{ id: crypto.randomUUID(), type: "text", textEditor: null	}]
	let front = $state(getInitialSideState())
	let back = $state(getInitialSideState())

	// Card is valid if it has atleast 1 non-empty text field or 1 chessboard
	let cardIsValid = $derived(sideHasContent(front))
	let frontBoardCount = $derived(countBoards(front))
	let showBoardNumbers = $derived(frontBoardCount + countBoards(back) > 1)
	let formAttemptedAndInvalid = $state(false);
	$effect(() => { if (cardIsValid) formAttemptedAndInvalid = false })

	// bound to the two CardSideEditor instances
	let frontEditor, backEditor;
	let editorsOpenError = $state(false);

	// bound to addCardForm element
	let addCardForm;

	const handleKeyDown = e => {
		if (e.ctrlKey || e.metaKey) {
			if (e.key === "Enter") {
				e.preventDefault();
				addCardForm.requestSubmit();
			}
			if (e.key === "u" || e.key === "o") {
				e.preventDefault();
			}
		}
	}

	onMount(() => {
		// set first front editor to focus on page load
		front[0].textEditor.focus();
	})
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="container card-surface">
	<p class="side-indicator">Front</p>
	{#if formAttemptedAndInvalid}
	<p style="color: red; margin-left: 16px; margin-top: 4px; margin-bottom: 4px;" >Front must have atleast 1 non-empty text field or 1 chessboard</p>
	{/if}
	<CardSideEditor bind:this={frontEditor} side={front} boardNumberOffset={0} {showBoardNumbers} />
	<p class="side-indicator" style="margin-top: 10px;">Back</p>
	<CardSideEditor bind:this={backEditor} side={back} boardNumberOffset={frontBoardCount} {showBoardNumbers} />
	{#if editorsOpenError}
		<p style="color: red; align-self: end; margin: 4px 16px 0 0;">All board editors must be closed (Ok or Cancel) before adding the card</p>
	{/if}
	<form
		bind:this={addCardForm}
		class="add-form"
		method="POST"
		use:enhance={({ formData, cancel }) => {
			editorsOpenError = frontEditor.hasOpenEditors() || backEditor.hasOpenEditors();
			if (editorsOpenError) {
				cancel();
				return;
			}
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
		margin-top: 34px;
		margin-bottom: 80px;
		padding: 12px 20px;
	}
	.side-indicator {
		margin-left: 14px;
		margin-bottom: 0px;
		font-size: 1.12rem;
		align-self: start;
	}
	.add-form {
		align-self: end;
	}
	.std-btn {
		margin-right: 10px;
	}
</style>
