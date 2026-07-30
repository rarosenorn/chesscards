<script>
	import { flip } from "svelte/animate"
	import { dndzone, TRIGGERS, SHADOW_ITEM_MARKER_PROPERTY_NAME } from "svelte-dnd-action"
	import { blockDnd } from "$lib/block-dnd-state.svelte.js"
	import { boardCaret, caretRange, setBoardCaret } from "$lib/block-caret-state.svelte.js"
	import { COLS, CARET_GAP_PX, CARET_WIDTH_PX, cellRows, rowNearestY, nearestGapInRow } from "$lib/tiptap-chessboard-block/geometry.js"
	import ChessboardNode from "$lib/components/ChessboardNode.svelte"
	import { isInteractive } from "$lib/tiptap-chessboard.svelte.js"

	// The Svelte face of a chessboardBlock PM node: a v1-style block of
	// boards — 2-col grid, per-board FEN/Duplicate/Edit/delete, and
	// svelte-dnd-action board dragging within and between blocks (zones see
	// each other across islands and sides). Every change commits the whole
	// boards array into the node attrs (onUpdate), so undo covers it.
	// The virtual board caret renders here too: its keyboard behavior lives
	// in tiptap-chessboard-block/caret.js, its pointer interactions (click,
	// shift+click, sweep selection) below.
	let { boards, blockId, ui, isBack, onUpdate, onEditingChange, onCaretActivated } = $props();

	// --- boards / dnd ---

	// local dnd copy of the boards, re-synced whenever the node attrs change
	// (undo, cross-block drops committing on the other side)
	let items = $state([]);
	$effect(() => {
		items = boards.map(b => ({ ...b }));
	});

	const commit = () => onUpdate($state.snapshot(items).map(({ [SHADOW_ITEM_MARKER_PROPERTY_NAME]: _drop, ...b }) => b));

	const isShadow = item => !!item[SHADOW_ITEM_MARKER_PROPERTY_NAME];

	// v1's measureDragHeight: the shadow renders as an empty box of the
	// dragged element's height (content re-mounting mid-drag jumped)
	const handleConsider = e => {
		const { trigger } = e.detail.info;
		if (trigger === TRIGGERS.DRAG_STARTED) {
			const index = e.detail.items.findIndex(isShadow);
			blockDnd.dragHeight = e.target.children[index]?.getBoundingClientRect().height ?? 0;
			blockDnd.dragging = true;
			document.body.classList.add("dnd-grabbing");
			// svelte-dnd focuses the dragged element (a11y); take focus
			// straight back so the document keeps its ring and the menu bar
			// stays enabled throughout the drag
			queueMicrotask(() => onCaretActivated?.());
		}
		if (trigger === TRIGGERS.DRAG_STOPPED) endDrag();
		items = e.detail.items;
	}

	const endDrag = () => {
		blockDnd.dragging = false;
		document.body.classList.remove("dnd-grabbing");
	}

	const handleFinalize = e => {
		items = e.detail.items;
		endDrag();
		commit();
		// the caret follows a dropped board so the keyboard keeps working
		// (on a cross-block drag only the receiving zone finds the id)
		const dropped = items.findIndex(item => item.id === e.detail.info.id);
		if (dropped >= 0) {
			setBoardCaret(blockId, dropped + 1, "up");
			onCaretActivated?.();
		}
	}

	// presses on interactive parts must not start a board drag; neither may
	// a shift-press, which extends the selection (captured here — see
	// handleCellClick) instead of moving the board. Other presses prevent
	// the default so the document never loses focus — a drag would blur it,
	// dropping the focus ring and disabling the menu bar mid-drag.
	// Firefox treats a contenteditable="false" island inside an editable root
	// as one atomic object: a drag starting in it selects the object instead
	// of the text in a field inside it. Making the root non-editable for the
	// duration of the press restores normal input behavior; PM never sees
	// these events anyway (the island stops them).
	const guardBoardPress = e => {
		if (isInteractive(e.target)) {
			e.stopImmediatePropagation();
			// buttons still click with the default prevented, but no longer
			// steal focus from the document (the menu-bar pattern); text
			// fields must keep their native focusing
			if (!e.target.closest("input, textarea, select, [contenteditable='true']")) e.preventDefault();
			return;
		}
		e.preventDefault();
		if (e.shiftKey && boardCaret.blockId === blockId && !editingIds[e.currentTarget.dataset?.boardId]) {
			shiftAnchor = boardCaret.anchor ?? boardCaret.index;
			e.stopImmediatePropagation();
		}
	}

	const duplicateBoard = i => {
		items.splice(i + 1, 0, {
			...$state.snapshot(items[i]),
			id: crypto.randomUUID(),
			fenInput: undefined
		});
		commit();
	}

	// --- board editors ---

	// Any open board editor makes the whole block PM-inert / undraggable.
	// Synchronous — the cell's full-row class must swap in the same frame as
	// the editor (the v1 jank fix); ChessboardNode defers its initial report
	// itself, so no mutation happens during render. Seeded from the shared
	// set so a board born with its editor open (insert) gets the full-row
	// cell in its very first layout — cm-chessboard measures synchronously
	// on mount, and a half-width first paint would visibly grow after.
	// svelte-ignore state_referenced_locally -- seeding from props/shared state on mount is the point
	let editingIds = $state(Object.fromEntries(boards.filter(b => ui.editingIds.has(b.id)).map(b => [b.id, true])));
	const setEditing = (id, value) => {
		editingIds[id] = value;
		onEditingChange(Object.values(editingIds).some(Boolean));
	};

	// an open editor renders ABOVE the row its board belongs to (both open:
	// left editor first); collapsed boards keep their order after it
	const cellOrder = i => Math.floor(i / COLS) * (COLS + 1) + (editingIds[items[i]?.id] ? i % COLS : COLS);

	// --- the virtual board caret (see block-caret-state.svelte.js) ---

	const active = $derived(boardCaret.blockId === blockId);
	const range = $derived(active ? caretRange() : null);
	// The caret spec: a gap renders after the board it follows, except at
	// the line start and on a row break with "down" affinity, where it
	// renders before the next board instead. A row break is a natural
	// 2-per-row wrap or either neighbor being an open (full-row) editor —
	// one index, two distinct stops, like a text line wrap. The stop at an
	// open editor's RIGHT exists but always renders hidden — clicking the
	// editor parks the caret there, ready for typing, without drawing a bar
	// beside a panel that is itself the focus; the editor's left may carry a
	// bar like any board.
	const rowBreakAt = i => i % COLS === 0 || !!editingIds[items[i - 1]?.id] || !!editingIds[items[i]?.id];
	const caretBefore = i => active && sideFocused && !range
		&& boardCaret.index === i
		&& (i === 0 || (rowBreakAt(i) && boardCaret.affinity === "down"));
	const caretAfter = i => active && sideFocused && !range && !editingIds[items[i]?.id]
		&& boardCaret.index === i + 1
		&& !(i + 1 < items.length && rowBreakAt(i + 1) && boardCaret.affinity === "down");
	const inRange = i => !!range && i >= range.from && i < range.to;

	// Measured extent of a cell's board face plus the bar under it (FEN/
	// buttons row, or the open editor's FEN row) — the caret and the
	// selection tint cover exactly this, not the number above or the move
	// line below, and not the cell box (a board can be narrower than its
	// cell, or overflow it at the minimum width).
	const boardExtent = cell => {
		const board = cell?.querySelector(".board");
		if (!board) return null;
		const rect = board.getBoundingClientRect();
		const bar = cell.querySelector(".button-row, .fen-row");
		return {
			left: rect.left,
			right: rect.right,
			top: rect.top,
			bottom: bar ? bar.getBoundingClientRect().bottom : rect.bottom
		};
	}

	// re-measure on any size change of the cell or its board
	const observeCell = (el, sync) => {
		sync();
		const observer = new ResizeObserver(sync);
		observer.observe(el.parentElement);
		const board = el.parentElement.querySelector(".board");
		if (board) observer.observe(board);
		return observer;
	}

	const caretPosition = (el, params) => {
		let before = params.before;
		const cell = el.parentElement;
		const sync = () => {
			const ext = boardExtent(cell);
			if (!ext) return;
			const cellRect = cell.getBoundingClientRect();
			// Left and width snap to whole device pixels — a fractional-width
			// bar otherwise rasterizes fatter or thinner depending on where
			// it happens to land. When snapping had to overshoot the nominal
			// thickness (1.5px can't exist at integer dpr), the ink lightens
			// proportionally so the perceived weight stays in between.
			const dpr = window.devicePixelRatio || 1;
			const width = Math.max(1, Math.ceil(CARET_WIDTH_PX * dpr)) / dpr;
			el.style.background = `rgba(0, 0, 0, ${Math.min(1, CARET_WIDTH_PX / width)})`;
			const left = before
				? ext.left - cellRect.left - CARET_GAP_PX
				: ext.right - cellRect.left + CARET_GAP_PX - width;
			el.style.top = ext.top - cellRect.top + "px";
			el.style.height = ext.bottom - ext.top + "px";
			el.style.width = width + "px";
			el.style.left = Math.round((cellRect.left + left) * dpr) / dpr - cellRect.left + "px";
		};
		const observer = observeCell(el, sync);
		return {
			update: p => { before = p.before; sync(); },
			destroy: () => observer.disconnect()
		};
	}

	// the blue selection tint: covers the board + its bar, and bridges the
	// gap to the next board when both sit selected on the same row (a
	// continuous sweep, like selected text)
	const rangePosition = (el, params) => {
		let joinNext = params.joinNext;
		const cell = el.parentElement;
		const sync = () => {
			const ext = boardExtent(cell);
			if (!ext) return;
			const cellRect = cell.getBoundingClientRect();
			const nextExt = joinNext ? boardExtent(cell.nextElementSibling) : null;
			el.style.top = ext.top - cellRect.top + "px";
			el.style.height = ext.bottom - ext.top + "px";
			el.style.left = ext.left - cellRect.left + "px";
			el.style.width = (nextExt ? nextExt.left : ext.right) - ext.left + "px";
		};
		const observer = observeCell(el, sync);
		return {
			update: p => { joinNext = p.joinNext; sync(); },
			destroy: () => observer.disconnect()
		};
	}

	// the native text caret hides while the virtual one is active
	let gridEl = $state();
	$effect(() => {
		const root = gridEl?.closest(".ProseMirror");
		if (!root) return;
		root.classList.toggle("virtual-caret-active", active);
		return () => root.classList.remove("virtual-caret-active");
	});

	// Like a native caret, the bar only shows while its side has focus (the
	// editor root contains the board islands, so focus there counts) — but
	// not while a text field (FEN input) owns the keyboard: one caret at a
	// time. The caret STATE survives blur and re-shows on focus.
	let sideFocused = $state(false);
	$effect(() => {
		const root = gridEl?.closest(".ProseMirror");
		if (!root) return;
		// deferred: during focusout activeElement hasn't landed yet
		const sync = () => queueMicrotask(() => {
			const el = document.activeElement;
			sideFocused = root.contains(el) && !el?.closest?.("input, textarea");
		});
		sync();
		document.addEventListener("focusin", sync);
		document.addEventListener("focusout", sync);
		return () => {
			document.removeEventListener("focusin", sync);
			document.removeEventListener("focusout", sync);
		};
	});

	// clicking a board always parks the virtual caret to the board's right and
	// hands focus back to the document — one predictable landing spot, whether
	// the board is a collapsed face or open in its editor (whose controls, all
	// interactive, keep their own clicks). shift+click extends the range from
	// the existing caret to the clicked side instead (the anchor is captured
	// on mousedown, before PM's own selection handling clears the caret state)
	let shiftAnchor = null;
	const handleCellClick = (e, i) => {
		if (isInteractive(e.target)) return;
		if (shiftAnchor != null) {
			const rect = e.currentTarget.getBoundingClientRect();
			const after = e.clientX > rect.left + rect.width / 2;
			const anchor = shiftAnchor;
			shiftAnchor = null;
			setBoardCaret(blockId, after ? i + 1 : i, after ? "up" : "down");
			if (anchor !== boardCaret.index) boardCaret.anchor = anchor;
		} else {
			setBoardCaret(blockId, i + 1, "up");
		}
		onCaretActivated?.();
	}

	// sweep-selecting from the grid's empty space (gaps/padding): the
	// nearest gap anchors, dragging extends the blue range like shift+arrows
	const gapAtPoint = (x, y) => {
		const rows = cellRows([...gridEl.querySelectorAll(".board-cell")]);
		if (!rows.length) return null;
		return nearestGapInRow(rowNearestY(rows, y), x);
	}
	const handleGridMouseDown = e => {
		if (e.button !== 0 || e.target !== gridEl) return;
		const start = gapAtPoint(e.clientX, e.clientY);
		if (!start) return;
		// PM must not see the press — its selection change would dismiss
		// the caret being placed
		e.preventDefault();
		e.stopPropagation();
		setBoardCaret(blockId, start.index, start.affinity);
		onCaretActivated?.();
		const move = ev => {
			const gap = gapAtPoint(ev.clientX, ev.clientY);
			if (!gap) return;
			boardCaret.index = gap.index;
			boardCaret.affinity = gap.affinity;
			boardCaret.anchor = gap.index === start.index ? null : start.index;
		};
		const up = () => {
			window.removeEventListener("mousemove", move);
			window.removeEventListener("mouseup", up);
		};
		window.addEventListener("mousemove", move);
		window.addEventListener("mouseup", up);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -- pointer-only sweep selection -->
<div
	bind:this={gridEl}
	class="board-grid-block"
	class:single={items.length < 2}
	use:dndzone={{
		items,
		type: "block-letter-boards",
		// 0: any drop animation aims at a stale rect around the shadow cell
		// and visibly lands high before popping down — snap instantly
		flipDurationMs: 0,
		useCursorForDetection: true,
		morphDisabled: true,
		transformDraggedElement: el => el.style.opacity = "0.85",
		dropTargetStyle: {}
	}}
	onconsider={handleConsider}
	onfinalize={handleFinalize}
	onmousedown={handleGridMouseDown}
>
	{#each items as board, i (board.id)}
		<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -- pointer-only drag guarding -->
		<div
			class="board-cell"
			class:shadow-cell={isShadow(board)}
			class:cell-editing={editingIds[board.id]}
			data-board-id={board.id}
			style:order={cellOrder(i)}
			style:height={isShadow(board) ? blockDnd.dragHeight + "px" : undefined}
			animate:flip={{ duration: blockDnd.dragging ? 150 : 0 }}
			onmousedown={guardBoardPress}
			ontouchstart={guardBoardPress}
			onclick={e => handleCellClick(e, i)}
		>
			{#if isShadow(board)}
				<!-- the drop placeholder keeps the cell's shape -->
			{:else}
				<ChessboardNode
					board={board}
					{isBack}
					{ui}
					boardMinWidth="280px"
					onUpdate={data => { items[i] = { ...data, id: board.id }; commit(); }}
					onEditingChange={value => setEditing(board.id, value)}
					onDuplicate={() => duplicateBoard(i)}
					onCaretAfter={() => { setBoardCaret(blockId, i + 1, "up"); onCaretActivated?.(); }}
				/>
				{#if caretBefore(i) || caretAfter(i)}
					<div class="board-caret" use:caretPosition={{ before: caretBefore(i) }}></div>
				{/if}
				{#if inRange(i)}
					<div class="range-overlay" use:rangePosition={{ joinNext: inRange(i + 1) && i % COLS === 0 }}></div>
				{/if}
			{/if}
		</div>
	{/each}
</div>

<style>
	/* full width: a row's first board starts exactly where the text does */
	.board-grid-block {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		grid-auto-flow: dense;
		/* rows sit closer than columns: the numbers above each board already
		   add visual air between rows */
		gap: 12px 20px;
	}
	/* a lone board keeps a 2-column cell's size, centered (like v1) */
	.board-grid-block.single {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.board-grid-block.single > .board-cell:not(.cell-editing) {
		width: calc(50% - 10px);
		min-width: min-content;
	}
	.board-cell {
		position: relative;
		display: flex;
		flex-direction: column;
	}
	/* svelte-dnd stamps inline user-select: none on every cell to keep board
	   drags from smearing selections. Firefox honours an ancestor's "none"
	   even inside a text field, so the FEN inputs become unselectable —
	   override it (important: the library's is inline) and only suppress
	   selection while a drag is actually running */
	.board-cell {
		user-select: auto !important;
		-webkit-user-select: auto !important;
	}
	:global(body.dnd-grabbing) .board-cell {
		user-select: none !important;
		-webkit-user-select: none !important;
	}
	/* the empty box standing in for the dragged board */
	.shadow-cell {
		box-sizing: border-box;
	}
	/* the virtual caret: a blinking bar beside the board face (position and
	   device-pixel-snapped width fully measured by caretPosition) — a real
	   element, so it never collides with the ::before board number */
	.board-caret {
		position: absolute;
		animation: board-caret-blink 2s step-end infinite;
		pointer-events: none;
		z-index: 2;
	}
	@keyframes board-caret-blink {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0;
		}
	}
	/* boards inside a shift-range tint like selected text (position fully
	   measured by rangePosition, bridging same-row gaps) */
	.range-overlay {
		position: absolute;
		background: rgba(0, 90, 224, 0.28);
		pointer-events: none;
		z-index: 2;
	}
	/* an open board editor takes the full row */
	.board-cell.cell-editing {
		grid-column: 1 / -1;
		width: 100%;
	}
</style>
