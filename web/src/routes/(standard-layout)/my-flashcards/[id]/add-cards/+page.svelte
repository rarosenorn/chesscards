<script>
	// The add-cards page: each card side is a tiptap document in which a
	// whole v1-style chessboard block is ONE embedded unit. The text caret
	// sits between blocks and text lines, a virtual board caret works inside
	// the blocks, and boards are managed with buttons and svelte-dnd
	// dragging (within and between blocks). Submit converts each doc to the
	// stored block-array format, so study/browse need no changes.
	import { getContext, onMount, tick } from "svelte"
	import { enhance } from "$app/forms"
	import { beforeNavigate } from "$app/navigation"
	import { browser } from "$app/environment"
	import { page } from "$app/state"
	import { blockDnd } from "$lib/block-dnd-state.svelte.js"
	import { DEFAULT_CARD_TYPE, loadCardType, saveCardType, loadDraft, saveDraft, clearDraft, loadFrozenSides, saveFrozenSides, loadFrozenBoards, saveFrozenBoards, loadStageId, saveStageId } from "$lib/add-cards-draft.js"
	import { stageName } from "$lib/stages.js"
	import Snowflake from "$lib/icons/Snowflake.svelte"
	import CardSideBlockEditor from "$lib/components/CardSideBlockEditor.svelte"
	import DocEditorMenuBar from "$lib/components/DocEditorMenuBar.svelte"
	import MoveRefDialog from "$lib/components/MoveRefDialog.svelte"
	import { insertChessboardBlock, insertBoardAtCaret } from "$lib/tiptap-chessboard-block/index.js"
	import { createTabTrap } from "$lib/tab-trap.js"
	import { createStage } from "../browse/browse.remote.js"
	import { docSideJsonBlocks, docToSideBlocks, canonicalSideJson, docHasContentBlocks, docCountBoardsBlocks, docBoardsBlocks, docInvalidBoardNumbersBlocks, invalidFenMessage } from "$lib/card-utils.js"

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

	// which stage the cards are filed into — like the type, a sticky mode of
	// writing the deck; a stored stage that has since been deleted falls back
	// to the last one
	let stagesSorted = $derived([...deck.stages].sort((a, b) => a.position - b.position));
	let stageId = $state(browser ? loadStageId(deckId) : null);
	let validStageId = $derived(
		stagesSorted.some(stage => stage.id === stageId)
			? stageId
			: stagesSorted[stagesSorted.length - 1]?.id
	);
	// A chapter can be started from here, so a run of cards that belongs in a
	// new one does not send you to the Cards tab and back. The + opens a
	// field beside the picker rather than in place of it: the chapter the
	// cards are filing into stays readable while the next one is named.
	//
	// Creating is committed by Add (or Enter), never by losing focus: a
	// click elsewhere used to make the chapter, or throw away what had been
	// typed, depending on how far the name had got. Blur now does nothing,
	// and only the x discards.
	let stageAdd = $state(null);

	const chooseStage = value => {
		stageId = value;
		saveStageId(deckId, value);
	}

	// focused by hand, not by autofocus: the front editor holds focus while
	// the card is being written, and autofocus on the freshly rendered field
	// does not take it away
	let stageAddInput = $state(null);
	const startAddStage = async () => {
		stageAdd = { value: "" };
		await tick();
		stageAddInput?.focus();
	}

	const cancelAddStage = () => { stageAdd = null };

	const commitAddStage = async () => {
		const name = stageAdd?.value.trim();
		if (!name) return;
		stageAdd = null;
		const before = new Set(deck.stages.map(stage => stage.id));
		Object.assign(deck, await createStage({ deckId, name }));
		const made = deck.stages.find(stage => !before.has(stage.id));
		if (made) chooseStage(made.id);
	}

	// a frozen side keeps its content through the submit, for a run of cards
	// off one position or one stem
	let frozenSides = $state(browser ? loadFrozenSides(deckId) : { front: false, back: false });
	const toggleFrozen = side => {
		frozenSides[side] = !frozenSides[side];
		saveFrozenSides(deckId, frozenSides);
	}
	// F9 with neither side focused acts on the whole card. Both sides are put
	// in the SAME state rather than each being flipped, which would merely
	// swap them whenever they differ: anything unfrozen freezes everything,
	// and only an already-frozen pair thaws.
	const toggleFrozenBoth = () => {
		const next = !(frozenSides.front && frozenSides.back);
		frozenSides = { front: next, back: next };
		saveFrozenSides(deckId, frozenSides);
	}

	// A single board can be frozen instead of its whole side: the side clears
	// around it and the position stays. Held by board id (a $state map, so the
	// snowflake on the board follows it) and handed to the boards through
	// boardUi, which is what already reaches every one of them.
	const frozenBoards = $state(browser ? loadFrozenBoards(deckId) : {});
	const toggleFrozenBoard = id => {
		if (frozenBoards[id]) delete frozenBoards[id];
		else frozenBoards[id] = true;
		saveFrozenBoards(deckId, frozenBoards);
	}
	const frozenBoardsOf = doc => docBoardsBlocks(doc).filter(board => frozenBoards[board.id]);
	// boards that went with a filed or deleted card leave their flag behind;
	// drop the ones the two sides no longer hold
	const pruneFrozenBoards = () => {
		const live = new Set([
			...docBoardsBlocks(frontEditor?.getJson()),
			...docBoardsBlocks(backEditor?.getJson())
		].map(board => board.id));
		for (const id of Object.keys(frozenBoards)) if (!live.has(id)) delete frozenBoards[id];
		saveFrozenBoards(deckId, frozenBoards);
	}

	// shared board-editing state (see ChessboardNode.svelte): survives PM node
	// view recreation on drags, and lets the submit apply open editors; board
	// ids are unique, so one store serves both sides. invalidBoards mirrors
	// v1's live FEN-validity reporting from open editors.
	const boardUi = { editingIds: new Set(), editorStates: {}, applyEditors: {}, invalidBoards: {}, frozenBoards, toggleFrozenBoard };

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

	// --- Anki's duplicate front ---
	// The front is compared with the front of every card in the deck, in the
	// stored form, as it is typed. Kept as strings, not documents: nothing here
	// needs the doc back, and a state proxy over every board on every keystroke
	// would be paid for nothing.
	const emptySideJson = canonicalSideJson([]);
	let frontSideJson = $state(emptySideJson);
	const readFront = () => {
		const side = docToSideBlocks(frontEditor?.getJson());
		frontSideJson = canonicalSideJson(side);
	}
	const handleFrontChanged = () => {
		readFront();
		handleDocChanged();
	}
	// recomputed as cards are added, so a frozen front starts duplicating the
	// card it just made — as in Anki. A map to one card carrying that front:
	// its id is what the Show duplicates link hands browse to filter on.
	const existingFronts = $derived(new Map(deck.cards.map(card => [canonicalSideJson(card.front), card.id])));
	// an empty front duplicates nothing (every board-less card's front is empty)
	const duplicateFront = $derived(
		frontSideJson !== emptySideJson && existingFronts.has(frontSideJson)
	);

	// --- added toast ---
	// bumped per add: the key remounts the note, so a second add inside the two
	// seconds replays the fade from the start instead of finishing the first
	let toastNonce = $state(0);
	let toastTimer;
	const showAddedToast = () => {
		toastNonce += 1;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => { toastNonce = 0 }, 2000);
	}

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
	// --- moves written into the text, wired to a board (tiptap-move-ref.js) ---
	// The editor that had focus is kept: the panel takes it while it is open,
	// and what it writes belongs to the side that was being written in.
	let movesOpen = $state(false);
	let movesBoards = $state([]);
	let movesEditor = null;
	// the card's boards in reading order, numbered as the card numbers them
	const cardBoards = () =>
		[...docBoardsBlocks(frontEditor?.getJson()), ...docBoardsBlocks(backEditor?.getJson())]
			.map((board, i) => ({ number: i + 1, fen: board.fen, moves: board.moves ?? [] }));
	const openMoves = () => {
		movesEditor = menu.editor ?? frontEditor?.getEditor();
		movesBoards = cardBoards();
		movesOpen = movesBoards.length > 0;
	}
	const insertMoves = content => {
		movesOpen = false;
		movesEditor?.chain().focus().insertContent(content).run();
	}

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
	// Add card — wrapping around; see $lib/tab-trap.js for the rules.
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

	const { handleKeydown: handleTrapKeydown, handleFocusIn } = createTabTrap(trapStops);

	const handleKeyDown = e => {
		// F9 freezes the side being written: the side whose editor holds focus
		// — asked of the DOM, so focus inside a board island still counts as
		// its side. With neither side focused it acts on both.
		if (e.key === "F9") {
			e.preventDefault();
			const wraps = [...(container?.querySelectorAll(".editor-wrap") ?? [])];
			const focused = wraps.findIndex(w => w.contains(document.activeElement));
			if (focused === -1) toggleFrozenBoth();
			else toggleFrozen(focused === 1 ? "back" : "front");
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
		// a restored draft is checked without waiting for a keystroke
		readFront();
		frontEditor.focus();
	})
</script>

<svelte:window onkeydown={handleKeyDown} onpagehide={flushDraft} />

{#snippet sideLabel(label, side, style = "")}
	<p class="side-indicator" {style}>
		<span class="side-name">
			{label}
			<!-- the duplicated cards: browse filters on the exact front of the
			     card this one duplicates, boards and all -->
			{#if side === "front" && duplicateFront}
				<a class="duplicates-link" href="/my-flashcards/{deckId}/browse?dupOf={existingFronts.get(frontSideJson)}">Show duplicates</a>
			{/if}
		</span>
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
	<!-- no chapters, nothing to file into: the cards go to the deck's one
	     stage, which validStageId already falls back to -->
	{#if deck.chapters}
	<div class="stage-picker">
		<label>
			Ch.
			<select value={validStageId} onchange={e => chooseStage(e.currentTarget.value)}>
				{#each stagesSorted as stage (stage.id)}
					<option value={stage.id}>{stageName(stage)}</option>
				{/each}
			</select>
		</label>
		<div class="stage-add" class:open={stageAdd}>
			<button
				type="button"
				class="stage-add-toggle"
				aria-label={stageAdd ? "Cancel new chapter" : "New chapter"}
				aria-expanded={!!stageAdd}
				onclick={() => stageAdd ? cancelAddStage() : startAddStage()}
			>
				<!-- drawn, not typed: a + and a x set as text sit off-centre
				     in the button by the font's own metrics -->
				<svg viewBox="0 0 16 16" aria-hidden="true">
					{#if stageAdd}
						<path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>
					{:else}
						<path d="M8 3 V13 M3 8 H13" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>
					{/if}
				</svg>
			</button>
			{#if stageAdd}
				<input
					class="stage-add-input"
					bind:this={stageAddInput}
					placeholder="Chapter name"
					bind:value={stageAdd.value}
					onkeydown={e => {
						if (e.key === "Enter") commitAddStage();
						if (e.key === "Escape") cancelAddStage();
						e.stopPropagation();
					}}
				/>
				<button
					type="button"
					class="stage-add-commit"
					disabled={!stageAdd.value.trim()}
					onclick={commitAddStage}
				>Add</button>
			{/if}
		</div>
	</div>
	{/if}
</div>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="container card-surface"
	bind:this={container}
	onkeydowncapture={handleTrapKeydown}
	onfocusin={handleFocusIn}
>
	<div class="menu-bar-holder">
		<DocEditorMenuBar
			{menu}
			onAddChessboard={addChessboard}
			onInsertMoves={openMoves}
			movesDisabled={frontBoards + backBoards === 0}
		/>
		{#if movesOpen}
			<MoveRefDialog
				boards={movesBoards}
				onInsert={insertMoves}
				onClose={() => movesOpen = false}
			/>
		{/if}
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
		duplicate={duplicateFront}
		onDocChanged={handleFrontChanged}
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
			formData.set("stageId", validStageId ?? "");

			return async ({ result, update }) => {
				// no invalidation: the deck context is updated by the push
				// below, a refetch's result would be discarded anyway
				await update({ invalidateAll: false })
				if (result.type !== "success") return;
				deck.cards.push(result.data.card);
				boardUi.editingIds.clear();
				boardUi.editorStates = {};
				// a frozen side stays for the next card, boards and all; an
				// unfrozen one clears down to the single boards frozen inside
				// it (captured before the clear, which takes the docs away)
				const keptFront = frozenSides.front ? null : frozenBoardsOf(front);
				const keptBack = frozenSides.back ? null : frozenBoardsOf(back);
				if (keptFront) frontEditor.clearKeeping(keptFront);
				if (keptBack) backEditor.clearKeeping(keptBack);
				pruneFrozenBoards();
				// the card is saved: the clears above have scheduled a write of
				// what is left, which drops the draft when nothing is
				flushDraft();
				// land in the side that was emptied, not the one kept — a side
				// holding a frozen board counts as kept
				const frontKept = frozenSides.front || keptFront?.length > 0;
				const backKept = frozenSides.back || keptBack?.length > 0;
				(frontKept && !backKept ? backEditor : frontEditor).focus();
				showAddedToast();
			}
		}}
	>
		{#key toastNonce}
			{#if toastNonce > 0}
				<span class="added-toast" role="status">Card added</span>
			{/if}
		{/key}
		<button
			class="std-btn"
			title="ctrl+enter"
		>
			Add card
		</button>
	</form>
</div>

<style>
	/* The editor keeps its own 880 rather than the card's 720: the open board
	   editor is laid out for this width, and a card that grows and shrinks
	   around it is worse than an editor wrapping text a little wider than
	   the card will. */
	.container {
		/* one number for the canvas's inset, so the sticky bar below can
		   bleed back out to the edge by exactly as much */
		--canvas-pad: 20px;
		margin-top: 6px;
		margin-bottom: 80px;
		/* 20px to the editors: with the editor's own 2px border and 10px
		   text padding that puts content 32px in — the card's rim exactly,
		   so a board sits the same distance from this canvas's edge as from
		   the card's. The card's width less that 64px of chrome lands the
		   content at the card's 818, and boards render at the card's sizes. */
		padding: 12px var(--canvas-pad);
		gap: 4px;
		max-width: var(--flashcard-width);
		position: relative;
	}
	/* card-type bar above the card, sharing its column width */
	.type-row {
		width: 100%;
		max-width: var(--flashcard-width);
		margin: 17px auto 0 auto;
		display: flex;
		align-items: center;
		/* the label all but leads the pills it names; the picker after them is
		   a separate thing and keeps the wider distance */
		gap: 8px;
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.6);
	}
	/* the chapter the cards file into, trailing the type it pairs with */
	.stage-picker {
		margin-left: 4px;
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: 12px;
	}
	.stage-picker label {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	/* One box that grows: closed it is the +, open it holds the field and
	   its Add. It wears the select's border so the two read as one control,
	   and stretches to the select's height whatever that works out to. */
	.stage-add {
		display: flex;
		align-items: center;
		align-self: stretch;
		border: 1px solid rgba(0, 0, 0, 0.25);
		border-radius: 4px;
		background-color: white;
		overflow: hidden;
	}
	.stage-add.open {
		border-color: var(--accent);
	}
	.stage-add-toggle {
		align-self: stretch;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		padding: 0;
		border: none;
		background: none;
		color: rgba(0, 0, 0, 0.6);
		cursor: pointer;
	}
	.stage-add-toggle svg {
		display: block;
		width: 13px;
		height: 13px;
	}
	.stage-add-toggle:hover {
		background-color: #f6f6f6;
		color: rgba(0, 0, 0, 0.85);
	}
	/* the inner edges are hairlines, not the box's own border: the parts
	   are divisions of one control rather than three controls in a row */
	.stage-add-input {
		/* no vertical padding, stretched instead: the field must not make
		   the box taller than the select it sits against */
		align-self: stretch;
		width: 150px;
		padding: 0 6px;
		border: none;
		border-left: 1px solid rgba(0, 0, 0, 0.15);
		background: none;
		font-size: 0.85rem;
	}
	.stage-add-input:focus {
		outline: none;
	}
	/* the app's neutral button, not the accent: adding a chapter is an
	   ordinary action on this row, not the row's primary one */
	.stage-add-commit {
		align-self: stretch;
		padding: 0 10px;
		border: none;
		border-left: 1px solid rgba(0, 0, 0, 0.15);
		background-color: #f5f5f5;
		color: #404040;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
	}
	.stage-add-commit:hover:enabled {
		background-color: #ececec;
	}
	.stage-add-commit:disabled {
		background-color: #f0f0f0;
		color: rgba(0, 0, 0, 0.35);
		cursor: default;
	}
	.stage-picker select {
		font-size: 0.85rem;
		padding: 3px 6px;
		border: 1px solid rgba(0, 0, 0, 0.25);
		border-radius: 4px;
		background-color: white;
		cursor: pointer;
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
		/* sticky already establishes the containing block the moves panel
		   hangs from */
		position: sticky;
		top: 0;
		z-index: 20;
		margin: -12px calc(-1 * var(--canvas-pad)) 4px calc(-1 * var(--canvas-pad));
		padding: 8px var(--canvas-pad) 0 var(--canvas-pad);
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
		position: relative;
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
	/* a sticky note in the card's bottom-left corner, gone before it is read
	   twice; positioned against the card so the button row never moves */
	.added-toast {
		position: absolute;
		left: 12px;
		bottom: 12px;
		white-space: nowrap;
		background: #fff9a8;
		border: 2px solid black;
		color: black;
		font-size: 0.85rem;
		padding: 3px 10px;
		pointer-events: none;
		animation: added-toast 2s ease forwards;
	}
	@keyframes added-toast {
		0%, 65% { opacity: 1; }
		100% { opacity: 0; }
	}
	/* the label and, when the front is a duplicate, its way to the cards it
	   repeats — the row's other end belongs to the freeze toggle */
	.side-name {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	/* centered on the row, positioned so the label and the freeze toggle
	   keep their places whether or not the link is showing */
	.duplicates-link {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 4px;
		font-size: 0.85rem;
		color: red;
	}
</style>
