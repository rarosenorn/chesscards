<script>
	// Experimental "Add cards 2": the single-list editor trial, living next
	// to the classic front/back Add cards for comparison. One column of
	// blocks, each marked Q or A in its bar; on submit the list is split into
	// front (Q blocks) and back (A blocks), so the stored card is an ordinary
	// front/back card and study/browse need no changes.
	import { getContext, onMount, tick } from "svelte"
	import { enhance } from "$app/forms"
	import CardEditor from "$lib/components/CardEditor.svelte"
	import { getSideJson, sideHasContent, countBoards, invalidBoardNumbers, invalidFenMessage } from "$lib/card-utils.js"
	import { createCardDnd } from "$lib/card-dnd.svelte.js"

	let { data } = $props();
	// the shared deck context (layout); new cards are pushed into it so
	// browse/study see them without a reload
	const deck = getContext("deck");
	// a fresh card starts as one question text field and one answer text field
	const getInitialBlocksState = () => [
		{ id: crypto.randomUUID(), type: "text", textEditor: null, answer: false },
		{ id: crypto.randomUUID(), type: "text", textEditor: null, answer: true }
	]

	// in-progress card lives in the deck layout's context so it survives tab
	// navigation within the deck
	const cardDrafts = getContext("cardDrafts");
	if (!cardDrafts.addCards2) {
		cardDrafts.addCards2 = {
			blocks: getInitialBlocksState(),
			// Anki-style mode: applies to every card added until changed
			cardType: "basic",
			dnd: createCardDnd()
		};
	}
	const draft = cardDrafts.addCards2;
	draft.cardType ??= "basic";
	const cardDnd = draft.dnd;

	// Card is valid if it has atleast 1 non-empty text field or 1 chessboard —
	// Q or A, so a deck can be outlined before filling in answers
	let cardIsValid = $derived(sideHasContent(draft.blocks))
	let showBoardNumbers = $derived(countBoards(draft.blocks) > 1)
	let formAttemptedAndInvalid = $state(false);
	$effect(() => { if (cardIsValid) formAttemptedAndInvalid = false })

	// bound to the CardEditor instance
	let cardEditor;

	// errors follow the attempted-and-still-invalid pattern: shown after a
	// blocked submit, then tracking the live condition until it clears
	let invalidFenAttempted = $state(false);
	let invalidBoardNums = $derived(invalidBoardNumbers(draft.blocks, 0, cardDnd));
	$effect(() => { if (invalidBoardNums.length === 0) invalidFenAttempted = false })

	// bound to addCardForm element
	let addCardForm;

	// --- tab trap ---
	// Tab cycles only the card-editing controls (text fields, per-board
	// FEN/Duplicate/Edit, open board editors' controls, the add buttons and
	// Add card), wrapping around. Escape releases the trap (WCAG 2.1.2) so
	// native tabbing can leave the form; focusing any trapped control again
	// re-arms it. Handled in capture so nothing (e.g. the text editor)
	// swallows Tab first.
	const TAB_SELECTOR = [
		".text-block [contenteditable='true']",
		// board-container scoped: TextEditor's toolbar rows are also .button-row,
		// and toolbar buttons must stay out of the cycle (they hide on blur,
		// which would drop focus to <body> and break the trap)
		".board-container .button-row input",
		".board-container .button-row button",
		".board-container-editing input",
		".board-container-editing button",
		".add-chessboard-btn",
		".add-block-container button",
		".add-form button"
	].join(", ");

	let trapEnabled = $state(true);
	let container;

	const handleTrapKeydown = e => {
		if (e.key === "Escape") {
			trapEnabled = false;
			document.activeElement?.blur();
			return;
		}
		if (e.key !== "Tab" || !trapEnabled) return;
		const targets = [...container.querySelectorAll(TAB_SELECTOR)]
			.filter(el => !el.disabled && el.offsetParent !== null);
		if (targets.length === 0) return;
		e.preventDefault();
		// closest: inside a text field the event target is a descendant node
		const i = targets.indexOf(e.target.closest?.(TAB_SELECTOR));
		const next = e.shiftKey
			? targets[i <= 0 ? targets.length - 1 : i - 1]
			: targets[(i + 1) % targets.length];
		next.focus();
	}

	const handleFocusIn = e => {
		if (e.target.closest?.(TAB_SELECTOR)) trapEnabled = true;
	}

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
		// set first text editor to focus on page load (a restored draft's
		// first block may be a chessboard block instead)
		draft.blocks[0]?.textEditor?.focus();
	})
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="type-row">
	<span id="card-type-label">Type</span>
	<div class="type-segments" role="radiogroup" aria-labelledby="card-type-label">
		{#each [
			["basic", "Basic", "Basic card type: Card is scheduled following FSRS (Free Spaced Repetition Scheduler)"],
			["tactic", "Tactic", "Tactic card type: If evaluated <i>Correct</i>, card is done. If evaluated <i>Incorrect</i>, card is scheduled for next day"]
		] as [value, label, description]}
			<button
				class="std-btn"
				role="radio"
				aria-checked={draft.cardType === value}
				class:selected={draft.cardType === value}
				onclick={() => draft.cardType = value}
			>
				{label}
				<span class="tooltip" aria-hidden="true">{@html description}</span>
			</button>
		{/each}
	</div>
</div>
<!-- svelte-ignore a11y_no_static_element_interactions -- container-level tab trap, not an interactive control -->
<div
	class="container card-surface"
	bind:this={container}
	onkeydowncapture={handleTrapKeydown}
	onfocusin={handleFocusIn}
>
	{#if formAttemptedAndInvalid}
	<p style="color: red; margin-left: 16px; margin-top: 4px; margin-bottom: 4px;" >The card must have atleast 1 non-empty text field or 1 chessboard</p>
	{/if}
	<CardEditor bind:this={cardEditor} blocks={draft.blocks} {showBoardNumbers} dnd={cardDnd} />
	{#if invalidFenAttempted && invalidBoardNums.length > 0}
		<p style="color: red; align-self: end; margin: 4px 16px 0 0;">{invalidFenMessage(invalidBoardNums)}</p>
	{/if}
	<form
		bind:this={addCardForm}
		class="add-form"
		method="POST"
		use:enhance={({ formData, cancel }) => {
			// open board editors are applied as if Ok was pressed; an invalid
			// FEN (in an editor or an inline input) blocks the submit
			cardEditor.applyOpenEditors();
			invalidFenAttempted = invalidBoardNums.length > 0;
			if (invalidFenAttempted) {
				cancel();
				return;
			}
			if (!cardIsValid) {
				formAttemptedAndInvalid = true;
				cancel();
			}

			// the single list splits into the stored front/back sides
			formData.set("front", getSideJson(draft.blocks.filter(block => !block.answer)));
			formData.set("back", getSideJson(draft.blocks.filter(block => block.answer)));
			formData.set("cardType", draft.cardType);

			return async ({ result, update }) => {
				// no invalidation: the deck context is updated by the push
				// below, a refetch's result would be discarded anyway
				await update({ invalidateAll: false })
				if (result.type !== "success") return;
				deck.cards.push(result.data.card);
				// editors stay open through the submit (no visual flash);
				// clear their state before the card they belong to resets
				draft.dnd.editingBoards = [];
				draft.dnd.editorStates = {};
				draft.blocks = getInitialBlocksState();
				await tick();
				draft.blocks[0].textEditor.focus();
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
		margin-top: 6px;
		margin-bottom: 80px;
		padding: 12px 20px;
	}
	/* card-type bar above the card, sharing its column width */
	.type-row {
		width: 100%;
		max-width: 900px;
		margin: 17px auto 0 auto;
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.6);
	}
	/* independent std-btn-style buttons (same press feel as Duplicate/Edit),
	   the selected one tinted accent */
	.type-segments {
		display: flex;
		gap: 4px;
	}
	/* unselected recedes grey, the selected pill is plain white — the
	   contrast alone carries the state, no accent border */
	.type-segments button {
		width: 62px;
		padding: 3px 0;
		border-radius: 999px;
		font-size: 0.85rem;
		cursor: pointer;
		position: relative;
		margin: 0;
		background-color: #e6e6e6;
		color: rgba(0, 0, 0, 0.65);
	}
	/* custom tooltip: appears after 300ms instead of the ~1s native delay
	   (a real element rather than a title attribute, so it can hold markup) */
	.type-segments button .tooltip {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		width: max-content;
		max-width: 300px;
		text-align: left;
		/* matches GlobalTooltip's default-Firefox skin */
		background-color: black;
		color: white;
		font-size: 13px;
		font-weight: 500;
		padding: 5px 10px;
		border-radius: 4px;
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		transition: opacity 100ms ease 300ms, visibility 0ms 300ms;
		z-index: 5;
	}
	.type-segments button:hover .tooltip {
		opacity: 1;
		visibility: visible;
	}
	.type-segments button.selected {
		background-color: white;
		color: black;
	}
	.add-form {
		align-self: end;
	}
	.std-btn {
		margin-right: 10px;
	}
</style>
