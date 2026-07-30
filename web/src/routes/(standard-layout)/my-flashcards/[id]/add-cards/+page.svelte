<script>
	// The add-cards page: each card side is a tiptap document in which a
	// whole v1-style chessboard block is ONE embedded unit. The text caret
	// sits between blocks and text lines, a virtual board caret works inside
	// the blocks, and boards are managed with buttons and svelte-dnd
	// dragging (within and between blocks). Submit converts each doc to the
	// stored block-array format, so study/browse need no changes.
	import { getContext, onMount } from "svelte"
	import { enhance } from "$app/forms"
	import { beforeNavigate } from "$app/navigation"
	import { browser } from "$app/environment"
	import { page } from "$app/state"
	import { blockDnd } from "$lib/block-dnd-state.svelte.js"
	import { DEFAULT_CARD_TYPE, loadCardType, saveCardType, loadDraft, saveDraft, clearDraft, loadFrozenSides, saveFrozenSides } from "$lib/add-cards-draft.js"
	import Snowflake from "$lib/icons/Snowflake.svelte"
	import CardSideBlockEditor from "$lib/components/CardSideBlockEditor.svelte"
	import DocEditorMenuBar from "$lib/components/DocEditorMenuBar.svelte"
	import { insertChessboardBlock, insertBoardAtCaret } from "$lib/tiptap-chessboard-block/index.js"
	import { docSideJsonBlocks, docHasContentBlocks, docCountBoardsBlocks, docInvalidBoardNumbersBlocks, invalidFenMessage } from "$lib/card-utils.js"

	// the shared deck context (layout); new cards are pushed into it so
	// browse/study see them without a reload
	const deck = getContext("deck");

	// The card being written and the card type are kept in localStorage per
	// deck (add-cards-draft.js), so both survive a tab switch, leaving the deck
	// and a reload. Read before the editors mount, so each side opens on its
	// stored document; the server render has no storage and uses the defaults.
	const deckId = page.params.id;
	const storedDraft = browser ? loadDraft(deckId) : null;

	// Anki-style mode: applies to every card added until changed
	let cardType = $state(browser ? loadCardType(deckId) : DEFAULT_CARD_TYPE);
	const chooseCardType = value => {
		cardType = value;
		saveCardType(deckId, value);
	}

	// a frozen side keeps its content through the submit, for a run of cards
	// off one position or one stem
	let frozenSides = $state(browser ? loadFrozenSides(deckId) : { front: false, back: false });
	const toggleFrozen = side => {
		frozenSides[side] = !frozenSides[side];
		saveFrozenSides(deckId, frozenSides);
	}

	// shared board-editing state (see ChessboardNode.svelte): survives PM node
	// view recreation on drags, and lets the submit apply open editors; board
	// ids are unique, so one store serves both sides. invalidBoards mirrors
	// v1's live FEN-validity reporting from open editors.
	const boardUi = { editingIds: new Set(), editorStates: {}, applyEditors: {}, invalidBoards: {} };

	// v1's board numbers: shown when the card has more than one board, the
	// back side continuing the front's count (CSS counters read these)
	let frontBoards = $state(0);
	let backBoards = $state(0);
	const recount = () => {
		frontBoards = docCountBoardsBlocks(frontEditor?.getJson());
		backBoards = docCountBoardsBlocks(backEditor?.getJson());
	}

	// bound to the two CardSideDocEditor instances
	let frontEditor, backEditor;
	let addCardForm;

	// The draft is written on a short debounce — a keystroke is not worth a
	// synchronous storage write — and flushed whenever the page can go away:
	// navigation unmounts the editors, pagehide covers a reload or a close.
	// An empty card stores nothing, so a submitted or emptied draft leaves no
	// stale entry behind.
	let saveTimer;
	const persistDraft = () => {
		const front = frontEditor?.getJson();
		const back = backEditor?.getJson();
		if (!front || !back) return;
		if (docHasContentBlocks(front) || docHasContentBlocks(back)) saveDraft(deckId, front, back);
		else clearDraft(deckId);
	}
	const flushDraft = () => {
		clearTimeout(saveTimer);
		persistDraft();
	}
	const handleDocChanged = () => {
		formAttemptedAndInvalid = false;
		invalidFenNumbers = [];
		clearTimeout(saveTimer);
		saveTimer = setTimeout(persistDraft, 250);
	}
	beforeNavigate(flushDraft);

	// The shared menu bar acts on whichever editor is focused; reassigned
	// (fresh object) so the bar's active states stay live. focused is an
	// explicit flag from tiptap's focus/blur events — NOT editor.isFocused,
	// whose live view.hasFocus() stays true while focus sits inside a board
	// island (it's inside the view's DOM), which kept the bar enabled
	// Every handler defers via queueMicrotask: tiptap emits focus/blur/
	// transaction events synchronously from wherever the DOM event lands —
	// including from inside a Svelte render flush (a mounting board editor
	// steals focus, tiptap dispatches blur mid-template-evaluation), where
	// mutating $state throws state_unsafe_mutation and aborts the transaction.
	let menu = $state({ editor: null, focused: false });
	const handleEditorFocus = editor => queueMicrotask(() => {
		// pending format toggles travel between the sides: bold switched on in
		// the front stays on when the caret moves to the back
		const prev = menu.editor;
		if (prev && prev !== editor) {
			if (prev.isActive("bold") !== editor.isActive("bold")) editor.commands.toggleBold();
			if (prev.isActive("italic") !== editor.isActive("italic")) editor.commands.toggleItalic();
		}
		menu = { editor, focused: true };
	});
	const handleEditorBlur = editor => queueMicrotask(() => {
		// a board drag steals focus for a beat (the dnd library focuses the
		// dragged element); the bar must not flicker off over it
		if (blockDnd.dragging) return;
		if (menu.editor === editor && !editor.isFocused) menu = { editor, focused: false };
	});
	const handleEditorRefresh = editor => queueMicrotask(() => {
		if (menu.editor === editor) menu = { ...menu, editor };
		recount();
	});

	// + Chessboard inserts at the virtual caret's gap when one is active,
	// otherwise as a new block in the last-focused editor
	const addChessboard = () => {
		const editor = menu.editor ?? frontEditor.getEditor();
		if (!insertBoardAtCaret(editor, boardUi)) insertChessboardBlock(editor, boardUi);
	}

	let formAttemptedAndInvalid = $state(false);

	// v1's invalid-FEN gating: shown after a blocked submit, cleared as the
	// docs change
	let invalidFenNumbers = $state([]);

	// --- tab trap ---
	// Tab cycles the three card-editing stops only — front text, back text,
	// Add card — wrapping around. Everything the boards own (FEN inputs, the
	// per-board buttons, an open board editor's controls) stays out of the
	// cycle: they are reached by clicking or by the board caret, not by Tab.
	// Escape releases the trap (WCAG 2.1.2) so native tabbing can leave the
	// form; focusing a stop again re-arms it. Capture phase, so ProseMirror
	// never sees the Tab first.
	let trapEnabled = $state(true);
	let container;

	// tabbing into a side lands the caret at its end, in one step: focusEnd
	// places the caret (the virtual board caret when a block sits last) before
	// focusing, where a bare .focus() would land at the start and then jump
	const trapStops = () => {
		const [front, back] = [...container.querySelectorAll(".editor-wrap")]
			.map(w => w.querySelector(".text-area > .ProseMirror"));
		const submit = addCardForm?.querySelector("button");
		return [
			{ el: front, focus: () => frontEditor.focusEnd() },
			{ el: back, focus: () => backEditor.focusEnd() },
			{ el: submit, focus: () => submit.focus() }
		].filter(stop => stop.el && !stop.el.disabled && stop.el.offsetParent !== null);
	}

	// focus inside a board sits inside the side's ProseMirror, so it counts as
	// that side's stop — tabbing out of a board lands on the next stop
	const stopOf = (stops, node) => stops.findIndex(({ el }) => el === node || el.contains(node));

	const handleTrapKeydown = e => {
		if (e.key === "Escape") {
			trapEnabled = false;
			document.activeElement?.blur();
			return;
		}
		if (e.key !== "Tab" || !trapEnabled) return;
		const stops = trapStops();
		if (stops.length === 0) return;
		e.preventDefault();
		const i = stopOf(stops, e.target);
		const next = e.shiftKey
			? stops[i <= 0 ? stops.length - 1 : i - 1]
			: stops[(i + 1) % stops.length];
		next.focus();
	}

	const handleFocusIn = e => {
		if (stopOf(trapStops(), e.target) !== -1) trapEnabled = true;
	}

	const handleKeyDown = e => {
		// F9 freezes the side being written: the side whose editor holds focus
		// — asked of the DOM, so focus inside a board island still counts as
		// its side. Anywhere else falls back to the front.
		if (e.key === "F9") {
			e.preventDefault();
			const wraps = [...(container?.querySelectorAll(".editor-wrap") ?? [])];
			toggleFrozen(wraps.findIndex(w => w.contains(document.activeElement)) === 1 ? "back" : "front");
			return;
		}
		if (e.ctrlKey || e.metaKey) {
			if (e.key === "Enter") {
				e.preventDefault();
				addCardForm.requestSubmit();
			}
			if (e.key === "u" || e.key === "o" || e.key === "k") {
				e.preventDefault();
			}
		}
	}

	onMount(() => {
		frontEditor.focus();
	})
</script>

<svelte:window onkeydown={handleKeyDown} onpagehide={flushDraft} />

{#snippet sideLabel(label, side, style = "")}
	<p class="side-indicator" {style}>
		{label}
		<!-- Anki's frozen fields: a frozen side survives the submit, so a run
		     of cards can share a position or a stem -->
		<button
			type="button"
			class="freeze-btn"
			class:frozen={frozenSides[side]}
			aria-pressed={frozenSides[side]}
			aria-label={frozenSides[side] ? `Unfreeze ${label} — it will clear after each card` : `Freeze ${label} — it will stay for the next card`}
			onclick={() => toggleFrozen(side)}
		>
			<Snowflake />
			<!-- the card type pills' tooltip, not a title: the native one is
			     placed by the browser and lands nowhere near this button -->
			<span class="tooltip" aria-hidden="true">Toggle freeze (f9)</span>
		</button>
	</p>
{/snippet}


<div class="type-row">
	<span id="card-type-label">Type</span>
	<div class="type-segments" role="radiogroup" aria-labelledby="card-type-label">
		{#each [
			["basic", "Basic", "Basic card type: Card is scheduled following FSRS (Free Spaced Repetition Scheduler)"],
			["tactic", "Tactic", "Tactic card type: If evaluated <i>Correct</i>, card is not seen again. If evaluated <i>Incorrect</i>, card is scheduled for next day"]
		] as [value, label, description]}
			<button
				class="std-btn"
				role="radio"
				aria-checked={cardType === value}
				class:selected={cardType === value}
				onclick={() => chooseCardType(value)}
			>
				{label}
				<span class="tooltip" aria-hidden="true">{@html description}</span>
			</button>
		{/each}
	</div>
</div>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="container card-surface"
	bind:this={container}
	onkeydowncapture={handleTrapKeydown}
	onfocusin={handleFocusIn}
>
	<div class="menu-bar-holder">
		<DocEditorMenuBar {menu} onAddChessboard={addChessboard} />
	</div>
	{@render sideLabel("Front", "front")}
	{#if formAttemptedAndInvalid}
		<p style="color: red; margin-left: 16px; margin-top: 4px; margin-bottom: 4px;">The card must have atleast 1 non-empty text field or 1 chessboard</p>
	{/if}
	<div class="editor-wrap" class:show-board-numbers={frontBoards + backBoards > 1} style="--board-offset: 0">
	<CardSideBlockEditor
		bind:this={frontEditor}
		{boardUi}
		initialDoc={storedDraft?.front}
		onDocChanged={handleDocChanged}
		onEditorFocus={handleEditorFocus}
		onEditorBlur={handleEditorBlur}
		onEditorTransaction={handleEditorRefresh}
	/>
	</div>
	{@render sideLabel("Back", "back", "margin-top: 12px;")}
	<div class="editor-wrap" class:show-board-numbers={frontBoards + backBoards > 1} style="--board-offset: {frontBoards}">
	<CardSideBlockEditor
		bind:this={backEditor}
		{boardUi}
		isBack
		initialDoc={storedDraft?.back}
		onDocChanged={handleDocChanged}
		onEditorFocus={handleEditorFocus}
		onEditorBlur={handleEditorBlur}
		onEditorTransaction={handleEditorRefresh}
	/>
	</div>
	{#if invalidFenNumbers.length > 0}
		<p style="color: red; align-self: end; margin: 4px 16px 0 0;">{invalidFenMessage(invalidFenNumbers)}</p>
	{/if}
	<form
		bind:this={addCardForm}
		class="add-form"
		method="POST"
		use:enhance={({ formData, cancel }) => {
			// open board editors are applied as if Ok was pressed (they stay
			// open through the submit, no visual flash); an invalid FEN — in
			// an editor or pending in an inline input — blocks the submit
			for (const apply of Object.values(boardUi.applyEditors)) apply();

			const front = frontEditor.getJson();
			const back = backEditor.getJson();
			const frontCount = docCountBoardsBlocks(front);
			invalidFenNumbers = [
				...docInvalidBoardNumbersBlocks(front, 0, boardUi),
				...docInvalidBoardNumbersBlocks(back, frontCount, boardUi)
			];
			if (invalidFenNumbers.length > 0) {
				cancel();
				return;
			}
			if (!docHasContentBlocks(front) && !docHasContentBlocks(back)) {
				formAttemptedAndInvalid = true;
				cancel();
				return;
			}

			formData.set("front", docSideJsonBlocks(front));
			formData.set("back", docSideJsonBlocks(back));
			formData.set("cardType", cardType);

			return async ({ result, update }) => {
				// no invalidation: the deck context is updated by the push
				// below, a refetch's result would be discarded anyway
				await update({ invalidateAll: false })
				if (result.type !== "success") return;
				deck.cards.push(result.data.card);
				boardUi.editingIds.clear();
				boardUi.editorStates = {};
				// a frozen side stays for the next card, boards and all
				if (!frozenSides.front) frontEditor.clear();
				if (!frozenSides.back) backEditor.clear();
				// the card is saved: the clears above have scheduled a write of
				// what is left, which drops the draft when nothing is
				flushDraft();
				// land in the side that was emptied, not the one kept
				(frozenSides.front && !frozenSides.back ? backEditor : frontEditor).focus();
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
		/* 30px to the editors: the distance boards/text had from the card
		   edge in the block editor (card 20px + block 10px) */
		padding: 12px 30px;
		gap: 4px;
		max-width: 880px;
	}
	/* card-type bar above the card, sharing its column width */
	.type-row {
		width: 100%;
		max-width: 880px;
		margin: 17px auto 0 auto;
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.6);
	}
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
		/* above the sticky menu-bar holder, which the tooltip hangs over */
		z-index: 30;
	}
	.type-segments button:hover .tooltip {
		opacity: 1;
		visibility: visible;
	}
	.type-segments button.selected {
		background-color: white;
		color: black;
	}
	/* the :active transform makes the button a stacking context, which would
	   trap the tooltip beneath the card below — lift the button while the
	   tooltip can be showing */
	.type-segments button:hover,
	.type-segments button:active {
		z-index: 30;
	}
	/* pinned to the viewport top while the card scrolls; the holder spans the
	   full card width (white, so content passes underneath cleanly) while the
	   bar's buttons start where the editors do */
	.menu-bar-holder {
		position: sticky;
		top: 0;
		z-index: 20;
		margin: -12px -30px 4px -30px;
		padding: 8px 30px 0 30px;
		background: white;
		border-radius: 8px 8px 0 0;
	}
	/* the snowflake sits at the far end of the side's label row, inset from
	   the right edge exactly as the name is from the left. Quiet until it is
	   holding something: off it is a hint, on it is the accent and latched */
	.freeze-btn {
		padding: 2px;
		border: none;
		background: none;
		border-radius: 4px;
		font-size: 1.15rem;
		line-height: 0;
		/* nudged off the label's centre line; offset rather than a margin, so
		   the row keeps its height (and vertical-align is inert on a flex
		   item, which this is) */
		position: relative;
		top: 1px;
		cursor: pointer;
	}
	/* off, the flake is drained of its colour — greyscaled rather than
	   repainted, which keeps its shading instead of flattening it to a
	   silhouette; on, it is simply itself */
	.freeze-btn :global(svg) {
		filter: grayscale(1) brightness(0.78);
		transition: filter 110ms ease;
	}
	.freeze-btn:hover :global(svg) {
		filter: grayscale(0.65) brightness(0.9);
	}
	.freeze-btn.frozen :global(svg),
	.freeze-btn.frozen:hover :global(svg) {
		filter: none;
	}
	.freeze-btn:hover {
		background: rgba(0, 0, 0, 0.05);
	}
	.freeze-btn.frozen:hover {
		background: var(--accent-subtle);
	}
	.freeze-btn:active {
		transform: translateY(1px);
	}
	/* hangs down-right from the button, like every other tooltip on the page;
	   it overhangs the card's right edge, which is fine on a desktop width
	   (one for the responsive pass) */
	.freeze-btn .tooltip {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		width: max-content;
		background-color: black;
		color: white;
		font-size: 13px;
		font-weight: 500;
		line-height: normal;
		padding: 5px 10px;
		border-radius: 4px;
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		transition: opacity 100ms ease 300ms, visibility 0ms 300ms;
		z-index: 30;
	}
	.freeze-btn:hover .tooltip {
		opacity: 1;
		visibility: visible;
	}
	/* the :active transform makes the button a stacking context, which would
	   trap the tooltip under the editor below — lift it while it can show */
	.freeze-btn:hover,
	.freeze-btn:active {
		z-index: 30;
	}
	/* the row spans the editor below it: the side's name at one end, its
	   freeze toggle at the other, both inset 3px from the card's text column */
	.side-indicator {
		align-self: stretch;
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-left: 3px;
		margin-right: 3px;
		margin-bottom: 1px;
		font-size: 1rem;
		line-height: 1.2;
	}
	/* flush with the editors' right edge */
	.add-form {
		align-self: end;
		margin-top: 12px;
	}
</style>
