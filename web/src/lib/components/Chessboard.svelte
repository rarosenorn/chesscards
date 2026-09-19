<script>
	import { onMount, getContext, untrack } from "svelte"
	import "cm-chessboard/assets/chessboard.css"
	import "cm-chessboard/assets/extensions/arrows/arrows.css"
	import "cm-chessboard/assets/extensions/markers/markers.css"
	import { Chessboard } from "cm-chessboard/src/Chessboard.js"
	import { Arrows } from "cm-chessboard/src/extensions/arrows/Arrows.js"
	import { Markers } from "cm-chessboard/src/extensions/markers/Markers.js"
	import { normalizeBoard } from "$lib/card-utils.js"
	import { replayMoves, showAnnotations, isPositionFinished } from "$lib/board-utils.js"
	import { playMoveSound } from "$lib/sounds.js"
	import { DEFAULT_BOARD_PREFS, boardStyleProps, hasBlackBorder, withSpriteCache } from "$lib/board-prefs.js"

	// `board` is a board object ({ fen, moves, annotations, solutionFrom,
	// solutionAnnotations, orientation }) or a legacy FEN string; `children`
	// renders between the board and the move line (e.g. the card editor's
	// FEN/Duplicate/Edit row).
	// `revealed` controls the solution layer: while false, moves from
	// solutionFrom on stay hidden and only the question annotations show; when
	// true the full line shows and solutionAnnotations displaces annotations
	// per position. `authorView` (editors/browse) tints the answer segment of
	// the move line so authors see what study hides; study turns it on with
	// the reveal, where it marks the same boundary in a line already shown.
	// `number` is the board's display number, shown in the strip above it when
	// the card has more than one board (the block editor numbers with a CSS
	// counter instead — see CardSideBlockEditor — because numbering there runs
	// across blocks in document order).
	// `aside` is a move clicked in the card's text (tiptap-move-ref): { from,
	// moves, at, nonce }, the branch to play and which of its moves to stop on.
	// The nonce is the click — clicking the same move twice is twice a request
	// to go there. `onPosition` answers back with where the board now stands,
	// in the same terms, so the text can mark the move it is showing.
	let { board, minWidth = "409px", flushBottom = false, revealed = true, authorView = false, onBack = false, number = null, autoFocus = false, inEditor = false, onSolutionFromChange = null, aside = null, onPosition = null, children } = $props();

	let normalized = $derived(normalizeBoard(board));
	let replay = $derived(replayMoves(normalized));
	// clamped: a solutionFrom beyond the (possibly failed) replay hides nothing
	let solutionFrom = $derived(
		normalized.solutionFrom == null
			? null
			: Math.min(normalized.solutionFrom, replay.moveInfos.length)
	);
	let visiblePlies = $derived(
		revealed || solutionFrom == null ? replay.moveInfos.length : solutionFrom
	);
	let positions = $derived(replay.fens.slice(0, visiblePlies + 1));
	// the aside being followed off this board's line, if any, and how far into
	// it the board has gone — the rest of it is below, past the line's own
	// stepping, which it borrows
	let following = $state(null);
	let asidePly = $state(null);
	// something to step through: the board's own line, or an aside followed
	// onto a board that has none
	let hasMoves = $derived(positions.length > 1 || following != null);
	// author view lists the whole line at all times (a divider marks where
	// the back begins); the eye only governs what the board itself shows,
	// so back moves are inert while it is closed
	let lineMoves = $derived(authorView ? replay.moveInfos : replay.moveInfos.slice(0, visiblePlies));

	// A card opens at its question, not at the start of its line: the moves
	// before solutionFrom are how the position came about, and replaying them
	// on every review is reading rather than retrieval. They stay on the move
	// line under the board, a step away.
	// with nothing hidden, the whole line is context and its last move is the
	// position the card is about
	// ...but a board on the card's BACK is the answer itself: its moves are
	// what was to be recalled, so it opens at the start of them and plays
	// forward, rather than handing over the finished position.
	let openAt = $derived(onBack ? 0 : (solutionFrom ?? replay.moveInfos.length));
	// svelte-ignore state_referenced_locally -- the effect below re-seeds it per card
	let currentIndex = $state(openAt);
	// Stepping is the only thing a board animates for, and goTo below is the
	// only way to step — so it says so outright. Inferring it from what
	// changed cannot: a swapped-in card, a reveal that lengthens the line and
	// a re-render all reach the same effect with a new position to show, and
	// tweening any of them reads as the pieces shuffling into place.
	let stepping = false;
	// a different board (e.g. next flashcard) starts back at its own question,
	// with nothing followed off it
	$effect(() => { void board; currentIndex = openAt; following = null; asidePly = null; });
	let displayIndex = $derived(Math.min(currentIndex, positions.length - 1));

	// An aside: moves the card's text writes off this board's line, at a ply of
	// it. Clicking one in the text plays it here — `following` is the branch
	// being played and `asidePly` which of its moves is on the board. The
	// board's own line is untouched underneath, so stepping back off the
	// aside's first move lands on the ply it left. (Its two state fields are
	// declared above, where the line's own reader needs them.)
	let asideReplay = $derived(
		following ? replayMoves({ fen: replay.fens[following.from], moves: following.moves }) : null
	);
	let asideMoves = $derived(asideReplay?.moveInfos ?? []);
	const followAside = ({ from, moves, at }) => {
		// a move the answer is still hiding stays hidden: the text may name it,
		// the board does not show it before the reveal
		if (from < 0 || from > visiblePlies) return;
		currentIndex = from;
		// The click was in the text, so the board does not have the keyboard —
		// and the arrows are how you walk back out of what you just clicked.
		// Taken quietly, as a click on the board itself takes it.
		takeFocus();
		// A move of the board's own line is a jump, nothing more. So is an
		// aside that no longer plays from there — text outlives the board it
		// was written against, and a card that has been edited under it should
		// still land on the position it names.
		const played = moves.length > 0 ? replayMoves({ fen: replay.fens[from], moves }) : null;
		if (!played || played.moveInfos.length < moves.length) {
			following = null;
			asidePly = null;
			return;
		}
		following = { from, moves };
		asidePly = Math.min(Math.max(at, 1), moves.length);
	}
	// the click arrives as a prop, so only the click is a dependency: the
	// request is answered once, not again when the board re-renders around it
	$effect(() => {
		const request = aside;
		if (request) untrack(() => followAside(request));
	});

	// where the board stands, for whoever wants to show it: a ply of its own
	// line, or a ply of the aside it is following
	$effect(() => {
		onPosition?.(asidePly != null && following
			? { from: following.from, moves: following.moves.join(" "), at: asidePly }
			: { from: displayIndex, moves: "", at: 0 });
	});

	// Whose move it is in the board's START position — the puzzle's premise,
	// which the position alone cannot show and a card's text may not say.
	// Deliberately not the position on screen: it is a property of the
	// diagram, and a marker flipping as you step would pull the eye. The
	// moves are on show while stepping anyway.
	let blackToMove = $derived(positions[0]?.split(" ")[1] === "b");
	// nobody is to move in a finished position: the strip keeps its height so
	// the board does not shift, it just has nothing to say
	let finished = $derived(isPositionFinished(positions[0]));

	// One-line move list, grouped so the line only wraps between pairs: each
	// pair is a number ("…" appended when black starts it, e.g. black moving
	// first or repeatedly) plus its move(s); each move keeps its move index so
	// clicking selects the position after it.
	let moveLine = $derived.by(() => {
		const pairs = [];
		let pairOpen = false;
		lineMoves.forEach(({ san, color }, index) => {
			if (color !== "b" || !pairOpen) {
				pairs.push({ number: pairs.length + 1, ellipsis: color === "b", moves: [] });
			}
			pairs[pairs.length - 1].moves.push({ san, index });
			pairOpen = color === "w";
		});
		return pairs;
	});

	let chessboardElement = $state();
	let cmBoard = $state();
	let renderedBoard = null;

	// the position on the board: the aside's, while one is being followed
	let displayFen = $derived(
		(asidePly != null ? asideReplay?.fens[asidePly] : null) ?? positions[displayIndex]
	);

	// on reveal the solution layer displaces the question annotations wherever
	// it has an entry for the position; an aside's positions are the text's,
	// and carry none of the line's own marks
	let displayedAnnotation = $derived(
		asidePly != null
			? null
			: revealed
				? normalized.solutionAnnotations[displayIndex] ?? normalized.annotations[displayIndex]
				: normalized.annotations[displayIndex]
	);

	// Everything that is not a step arrives at once: the position is written
	// into the board and drawn in the very frame the rest of the card changed
	// in. setPosition() cannot do that — even a duration-0 change goes through
	// cm-chessboard's animation queue, which holds the previous card's pieces
	// on screen for a frame or two and then slides them into place. That lag,
	// against text and layout that swapped instantly, is the shuffle.
	// Enqueued all the same: the queue is empty in the ordinary case and runs
	// this synchronously, and when a step is still in flight it keeps our
	// draw after the one that animation ends with, which would otherwise
	// paint the old card's position over the new one.
	const snapTo = fen => {
		cmBoard.state.position.setFen(fen);
		cmBoard.positionAnimationsQueue.enqueue(() => {
			if (cmBoard.view) cmBoard.view.redrawPieces();
			return Promise.resolve();
		});
	}

	$effect(() => {
		const fen = displayFen;
		const annotation = displayedAnnotation;
		if (!cmBoard) return;
		// Only a step animates, and only within the board it stepped on: study
		// and browse reuse this component across cards, and tweening one
		// card's position into the next card's reads as the pieces shuffling
		// around rather than a new card arriving.
		const stepped = stepping && renderedBoard === normalized;
		if (cmBoard.getOrientation() !== normalized.orientation) {
			// not setOrientation(): its queued board-turn ritual (empty the
			// board, flip, refill) runs even "un-animated", and on a card swap
			// it plays out as the old pieces shuffling around before the new
			// card lands. Here orientation only ever changes because a
			// different board swapped in — a fact of the new diagram, not a
			// change to watch — so write it and redraw in place. The pieces
			// follow from the snap below, in the same frame.
			cmBoard.state.orientation = normalized.orientation;
			cmBoard.view.redrawBoard();
		}
		if (stepped) cmBoard.setPosition(fen, true);
		else snapTo(fen);
		stepping = false;
		renderedBoard = normalized;
		showAnnotations(cmBoard, annotation);
	})

	const boardPrefs = getContext("boardPrefs") ?? (() => DEFAULT_BOARD_PREFS);

	onMount(() => {
		cmBoard = withSpriteCache(boardPrefs().pieceSet, () => new Chessboard(chessboardElement, {
			position: displayFen,
			orientation: normalized.orientation,
			assetsUrl: "/chessboard-assets/", // wherever you copied the assets folder to, could also be in the node_modules folder
			style: boardStyleProps(boardPrefs()),
			extensions: [{ class: Arrows }, { class: Markers }]
		}))
		// cm-chessboard sizes its inner box to whole pixels inside our
		// fractional-width container; --board-px lets the bar below and the
		// move line match the board's real rendered width exactly.
		// offsetWidth, not getBoundingClientRect: a board mounting mid
		// flip-animation is scaled, and rect widths include transforms — the
		// too-wide measurement would stick (no further layout resize fires
		// the observer). The outer element is observed as well, so a cell
		// resize re-measures even if cm-chessboard replaces the inner box.
		// The bordered box is centered inside a fractional-width cell, so it
		// can land on a half pixel — the border then straddles the device
		// grid and the left/right edges rasterize thinner/blurrier than the
		// top/bottom. Nudge the whole wrapper (board, bar and move line move
		// together, keeping their alignment) so the box starts on a whole
		// device pixel.
		const snapToPixelGrid = () => {
			wrapperElement.style.transform = "";
			const rect = chessboardElement.firstElementChild.getBoundingClientRect();
			const dpr = window.devicePixelRatio || 1;
			const dx = (Math.round(rect.left * dpr) - rect.left * dpr) / dpr;
			const dy = (Math.round(rect.top * dpr) - rect.top * dpr) / dpr;
			if (dx || dy) wrapperElement.style.transform = `translate(${dx}px, ${dy}px)`;
		}
		const syncWidth = () => {
			wrapperElement.style.setProperty(
				"--board-px", chessboardElement.firstElementChild.offsetWidth + "px"
			);
			snapToPixelGrid();
		};
		syncWidth();
		const resizeObserver = new ResizeObserver(syncWidth);
		resizeObserver.observe(chessboardElement.firstElementChild);
		resizeObserver.observe(chessboardElement);
		chessboardElement.addEventListener("wheel", handleWheel, { passive: false });
		return () => {
			chessboardElement.removeEventListener("wheel", handleWheel);
			resizeObserver.disconnect();
			cmBoard.destroy();
		};
	})

	// stepping forward sounds the move being made, stepping back the move
	// being unmade (both are the move crossed between the two positions)
	const goTo = index => {
		if (index !== displayIndex) {
			const crossed = index > displayIndex ? index - 1 : displayIndex - 1;
			playMoveSound(replay.moveInfos[crossed]?.san);
			stepping = true;
		}
		currentIndex = index;
	}
	// a click in the list is a jump, not a step: it can cross a dozen moves,
	// so the board snaps to that position and nothing is sounded
	const jumpTo = index => {
		asidePly = null;
		currentIndex = index;
	}
	// the same two, inside an aside. Leaving it backwards is a step like any
	// other — the move being unmade is the aside's first — and it lands on the
	// ply the aside branched at, where the board's own line carries on.
	const stepAside = ply => {
		playMoveSound(asideMoves[ply > asidePly ? ply - 1 : asidePly - 1]?.san);
		stepping = true;
		asidePly = ply;
	}
	const leaveAside = () => {
		playMoveSound(asideMoves[0]?.san);
		stepping = true;
		asidePly = null;
	}
	// An aside is a dead end forwards: its last move is the last thing the text
	// claimed, and running on into the line's own continuation would be a
	// different game. Backwards it rejoins the line it left.
	let atLineStart = $derived(asidePly == null && displayIndex === 0);
	let atLineEnd = $derived(
		asidePly != null ? asidePly >= asideMoves.length : displayIndex === positions.length - 1
	);
	const previous = () => {
		if (asidePly != null) {
			if (asidePly > 1) stepAside(asidePly - 1);
			else leaveAside();
			return;
		}
		if (displayIndex > 0) goTo(displayIndex - 1);
	}
	const next = () => {
		if (asidePly != null) {
			if (asidePly < asideMoves.length) stepAside(asidePly + 1);
			return;
		}
		if (displayIndex < positions.length - 1) goTo(displayIndex + 1);
	}

	let wrapperElement = $state();

	// note for the responsive pass: on touch there is no wheel/keyboard, so
	// tap zones on the board halves may come back for touch input only —
	// desktop clicks stay reserved for future piece interaction on cards

	// scroll steps through the moves (lichess-style); deltas accumulate so
	// trackpads don't fire a step per micro-tick, and page scroll is always
	// swallowed over a board with moves. Attached manually: svelte's wheel
	// handlers are passive, which forbids preventDefault.
	// Focus taken by a click or a scroll must not draw the keyboard ring:
	// Chrome counts a programmatic focus() as :focus-visible whenever the last
	// input was a key, so switching tabs with s/b and then scrolling a board
	// would light it up. The flag lasts as long as the focus does — stepping
	// through moves with the arrows is not a new arrival — and only clears on
	// blur, so the ring belongs to focus that arrived by tabbing.
	let pointerFocus = $state(false);
	const takeFocus = () => {
		// inEditor: the text editor keeps the keyboard. A board living in a
		// document is not a focus stop — taking focus here blurs ProseMirror,
		// which greys the menu bar and hands bare letters back to the deck's
		// tab shortcuts instead of typing them. Stepping still works (the
		// buttons and the wheel never needed focus), and the arrows belong to
		// the virtual board caret.
		if (inEditor) return;
		pointerFocus = true;
		wrapperElement.focus({ preventScroll: true });
	}

	// The active card's first board takes focus as its card arrives (study's
	// current card, the Cards preview), so ←/→ step the moves without a
	// click first. Never off a field being typed in, and quietly: an arrival
	// the user did not tab to draws no keyboard ring, like takeFocus above.
	$effect(() => {
		void normalized;
		if (!autoFocus || !hasMoves || !wrapperElement) return;
		const active = document.activeElement;
		if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT" || active.isContentEditable)) return;
		pointerFocus = true;
		wrapperElement.focus({ preventScroll: true });
	});

	let wheelAcc = 0;
	let lastWheel = 0;
	const handleWheel = e => {
		if (!hasMoves) return;
		e.preventDefault();
		// the gesture takes the board over, so hand it the keyboard too:
		// stepping on can continue with the arrow keys, as after a click
		takeFocus();
		const now = performance.now();
		if (now - lastWheel > 250) wheelAcc = 0;
		lastWheel = now;
		wheelAcc += e.deltaY;
		if (wheelAcc > 40) {
			next();
			wheelAcc = 0;
		} else if (wheelAcc < -40) {
			previous();
			wheelAcc = 0;
		}
	}

	// --- the front/back boundary marker ---
	// solutionFrom is a gap in the move line: the ply the back begins at, or
	// null for a line that is all front — which IS the gap past the last
	// move, where the marker rests. Hosts that can commit the change (the
	// card editors, via onSolutionFromChange) make it draggable along the
	// line; everywhere else it is the read-only "Back:" divider it has always
	// been, drawn only where a boundary exists.
	let moveLineEl = $state();
	let dragGap = $state(null);
	const splitEditable = $derived(!!onSolutionFromChange && authorView && lineMoves.length > 0);
	const shownGap = $derived(dragGap ?? solutionFrom ?? lineMoves.length);
	const markerAt = g => authorView && (splitEditable ? shownGap === g : solutionFrom === g);

	// The moves' boxes, measured. Frozen for the length of a drag: the marker
	// takes room in the line, so every gap it lands on pushes the moves after
	// it along — measured live, that shift moves the next gap under the
	// cursor and the marker runs away down the line on its own.
	let dragRects = null;
	const moveRects = () => dragRects
		?? [...(moveLineEl?.querySelectorAll(".move-btn") ?? [])].map(btn => btn.getBoundingClientRect());

	// the gap nearest a point: the move whose box is closest, taken on the
	// side the point falls. Distance to the box (not to its centre) picks the
	// right move on a wrapped line, where rows sit far apart vertically.
	const gapNearest = (x, y) => {
		const rects = moveRects();
		let best = null;
		let bestDist = Infinity;
		rects.forEach((r, i) => {
			const dx = Math.max(r.left - x, 0, x - r.right);
			const dy = Math.max(r.top - y, 0, y - r.bottom);
			const dist = dx * dx + dy * dy;
			if (dist < bestDist) {
				bestDist = dist;
				best = { i, r };
			}
		});
		if (!best) return lineMoves.length;
		return x > best.r.left + best.r.width / 2 ? best.i + 1 : best.i;
	}

	// How far a click may sit from a move and still be meant for it. The line
	// runs the board's full width, so most of it is empty air past the last
	// move — and a click out there was landing on the nearest move, which is
	// always the last one. Placing the boundary is aiming at a gap between two
	// moves, and that is never far from both.
	const GAP_REACH = 14;
	const nearAMove = (x, y) => moveRects().some(r =>
		Math.max(r.left - x, 0, x - r.right) <= GAP_REACH
			&& Math.max(r.top - y, 0, y - r.bottom) <= GAP_REACH
	);

	// the gap past the last move means "nothing is back yet"
	const commitGap = gap => onSolutionFromChange?.(gap >= lineMoves.length ? null : gap);

	// Direct listeners, not onmousedown/onclick: svelte delegates both from
	// the app root, and inside the editor the press is stopped short of it
	// (the board island's own press guards) — the line never heard its own
	// clicks.
	const listen = (el, type, handler) => {
		el.addEventListener(type, handler);
		return { destroy: () => el.removeEventListener(type, handler) };
	}
	const markerHandle = el => listen(el, "mousedown", startMarkerDrag);
	const lineHandle = el => listen(el, "click", handleLineClick);

	const startMarkerDrag = e => {
		if (!splitEditable || e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		dragRects = moveRects();
		dragGap = shownGap;
		let moved = false;
		const move = ev => {
			moved = true;
			dragGap = gapNearest(ev.clientX, ev.clientY);
		};
		const up = () => {
			window.removeEventListener("mousemove", move);
			window.removeEventListener("mouseup", up);
			const gap = dragGap;
			dragGap = null;
			dragRects = null;
			if (moved) {
				// the release lands on a move button as often as not, and its
				// click would step the board; the drag was the whole gesture
				window.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation() }, { capture: true, once: true });
				commitGap(gap);
			}
		};
		window.addEventListener("mousemove", move);
		window.addEventListener("mouseup", up);
	}

	// a click on the line's own space (between pairs, or the run past the
	// last move) drops the marker at the nearest gap; clicks on the moves
	// themselves keep stepping the board
	const handleLineClick = e => {
		if (!splitEditable || e.target.closest("button, .back-divider")) return;
		// the empty run of line past the last move belongs to nothing: a click
		// there moved the boundary to the end, and the board with it
		if (!nearAMove(e.clientX, e.clientY)) return;
		commitGap(gapNearest(e.clientX, e.clientY));
	}

	// only reached outside an editor (inEditor boards take no focus, so the
	// arrows are the document's — the virtual board caret's — throughout)
	const handleKeyDown = e => {
		if (e.key === "ArrowLeft") {
			e.preventDefault();
			previous();
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			next();
		} else if (e.key === "ArrowUp") {
			// lichess's jump to either end of the line: both are jumps, not
			// steps, so neither is sounded or animated
			e.preventDefault();
			jumpTo(0);
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			jumpTo(positions.length - 1);
		}
	}
</script>

{#snippet backMarker()}
	<!-- svelte-ignore a11y_no_static_element_interactions -- pointer-only drag; the divider is a label, not a control, wherever it cannot move -->
	<span
		class="back-divider"
		class:draggable={splitEditable}
		class:resting={splitEditable && shownGap === lineMoves.length}
		class:dragging={dragGap != null}
		use:markerHandle
	>Back:</span>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
<div
	style="min-width: {minWidth}"
	class="board-wrapper"
	class:pointer-focus={pointerFocus}
	onblur={() => {
		// a window switch blurs the focused element too, and the return
		// refocuses it as a keyboard arrival — that round trip must not
		// surrender the flag, or coming back to the browser draws the ring.
		// A blur while the document still has focus is a real departure.
		if (document.hasFocus()) pointerFocus = false;
	}}
	bind:this={wrapperElement}
	tabindex={hasMoves && !inEditor ? 0 : undefined}
	role="group"
	aria-label={hasMoves && !inEditor ? "Chessboard, use arrow keys to step through moves" : "Chessboard"}
	onkeydown={hasMoves && !inEditor ? handleKeyDown : undefined}
>
	<!-- The strip above every board: its number (when the card has more than
	     one) and the side to move, which takes the number's place on a lone
	     board. Always rendered, at a fixed height, so a board does not shift
	     when the number comes and goes — or when the position is mate or
	     stalemate, where there is no side to move at all. -->
	<div class="board-header">
		{#if number != null}<span class="board-number">{number}</span>{/if}
		{#if !finished}
			<span
				class="side-to-move"
				class:black={blackToMove}
				role="img"
				aria-label={blackToMove ? "Black to move" : "White to move"}
			></span>
		{/if}
	</div>
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -- keyboard stepping lives on the focusable wrapper -->
	<div
		class="board"
		class:black-border={hasBlackBorder(boardPrefs())}
		class:flush-bottom={flushBottom}
		bind:this={chessboardElement}
		onclick={hasMoves ? takeFocus : undefined}
	></div>
	{@render children?.()}
	<!-- an aside is not listed here: the text it was written in is where it
	     reads, and the highlight moves with the board over there. The line
	     still renders while one is being followed, for its step buttons. -->
	{#if lineMoves.length > 0 || following}
		<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -- pointer-only boundary placing; the editor's own controls set it by keyboard -->
		<div class="move-line" bind:this={moveLineEl} use:lineHandle>
			<button
				class="step-btn"
				aria-label="Previous move"
				disabled={atLineStart}
				onclick={previous}
			>‹</button>
			<button
				class="step-btn"
				aria-label="Next move"
				disabled={atLineEnd}
				onclick={next}
			>›</button>
			{#each moveLine as pair}
				<span class="move-pair">
					<!-- the boundary marker precedes the pair number when the
					     back starts the pair ("Back: 2 e4"), and sits between
					     the moves when it starts mid-pair ("2 e4 Back: e5") -->
					{#if markerAt(pair.moves[0]?.index)}{@render backMarker()}{/if}
					<span class="move-number">{pair.number}</span>
					{#each pair.moves as move, moveIndex}
						{#if moveIndex > 0 && markerAt(move.index)}{@render backMarker()}{/if}
						<button
							class="move-btn"
							class:current={asidePly == null && displayIndex === move.index + 1}
							disabled={authorView && !revealed && solutionFrom != null && move.index >= solutionFrom}
							onclick={() => jumpTo(move.index + 1)}
						>
							{pair.ellipsis && moveIndex === 0 ? "…" + move.san : move.san}
						</button>
					{/each}
				</span>
			{/each}
			<!-- The end spot: a line that is all front. Only while the marker is
			     being dragged there — a board with no boundary says so by
			     showing nothing, and the board's own editor is where one is
			     made from scratch. -->
			{#if splitEditable && dragGap != null && shownGap === lineMoves.length}{@render backMarker()}{/if}
		</div>
	{/if}
</div>

<style>
	/* The border lives on cm-chessboard's whole-pixel inner box (not on this
	   fractional-width container), so the frame hugs the board exactly and
	   --board-px (measured on that box, border included) gives the bar and
	   move line the same outer width. The dark background makes any svg
	   rasterization slack at fractional zoom read as border, not white. */
	.board.black-border > :global(div) {
		border: 2px solid #404040;
		background-color: #404040;
		border-radius: 2px;
	}
	.board.flush-bottom > :global(div) {
		border-radius: 2px 2px 0 0;
	}
	/* a flush bar below overlaps 2px (CardSideEditor); widen the bottom
	   border so 2px stay visible, matching the other sides */
	.board.black-border.flush-bottom > :global(div) {
		border-bottom-width: 4px;
	}
	/* Containment breaks a sizing feedback loop: the rendered svg and the
	   --board-px-wide bar/move line all have fixed pixel widths, which would
	   otherwise feed the surrounding cell's min-content — locking the cell
	   at whatever width the board once rendered at (the cell then never
	   shrinks, the board never re-renders smaller, and the drag shadow's
	   correct size mismatches the real one, making drops snap dirty). With
	   inline-size containment the cell sizes the board, never the reverse. */
	/* The ring belongs to Tab arrivals alone. Every other way focus lands on
	   a board — a click, a scroll, the active card's auto-focus on switches
	   and reveals — sets pointer-focus first, and this rule (out-weighing
	   the ring rule below) keeps those arrivals quiet. */
	.board-wrapper.pointer-focus:focus-visible {
		outline: none;
	}
	.board-wrapper {
		display: flex;
		flex-direction: column;
		contain: inline-size;
	}
	/* center the whole-pixel board box, and give everything below it (the
	   slotted FEN/Duplicate/Edit bar, the move line) that exact width so
	   edges align instead of the bar overhanging the board */
	.board > :global(div) {
		margin: 0 auto;
	}
	/* the strip shares the board's exact width, so the number sits over the
	   board's left edge rather than the cell's */
	.board-header {
		display: flex;
		align-items: center;
		gap: 7px;
		/* the number's line box: held even when there is no number, so a board
		   sits at the same height whether or not the card numbers its boards */
		min-height: 1.26rem;
		margin-bottom: 2px;
		width: var(--board-px, 100%);
		max-width: 100%;
		margin-left: auto;
		margin-right: auto;
		padding-left: 6px;
		box-sizing: border-box;
	}
	/* the side to move, as a piece-coloured square: no wording to translate,
	   and it reads at a glance beside the number */
	.side-to-move {
		/* whole pixels, not rem: at a fractional size the border rasterizes
		   thicker on two sides and the square reads as a rectangle */
		width: 14px;
		height: 14px;
		background: white;
		/* the border carries the white square — without it the square would
		   vanish into the card surface — so it is drawn, not hinted at */
		border: 1px solid #262626;
		box-sizing: border-box;
	}
	.side-to-move.black {
		background: #262626;
	}
	.board-wrapper > :global(.button-row),
	.board-wrapper > .move-line {
		width: var(--board-px, 100%);
		/* a stale-wide --board-px (measured mid-transition) must never widen
		   the row past the wrapper; the observer corrects it a frame later */
		max-width: 100%;
		box-sizing: border-box;
		margin-left: auto;
		margin-right: auto;
	}
	.board-wrapper:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	/* quiet step controls heading the move line; the ends fade out rather
	   than disappear, so the line never shifts */
	.step-btn {
		border: none;
		background-color: transparent;
		border-radius: 3px;
		padding: 0 8px 2px 8px;
		font-size: 1.3rem;
		line-height: 1;
		color: rgba(0, 0, 0, 0.55);
		cursor: pointer;
		user-select: none;
	}
	.step-btn:last-of-type {
		margin-right: 4px;
	}
	.step-btn:hover:enabled {
		background-color: gainsboro;
		color: black;
	}
	.step-btn:disabled {
		color: rgba(0, 0, 0, 0.2);
		cursor: default;
	}
	.move-line {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		column-gap: 6px;
		padding: 4px 2px;
	}
	/* a pair (number + its moves) never breaks across lines */
	.move-pair {
		display: inline-flex;
		align-items: baseline;
		column-gap: 2px;
		white-space: nowrap;
	}
	.move-number {
		font-size: 0.85rem;
	}
	/* the pair's two moves sit close together (the buttons' own padding
	   still separates them and keeps the hover pill intact) */
	.move-pair .move-btn + .move-btn {
		margin-left: -4px;
	}
	.move-btn {
		border: none;
		background-color: transparent;
		border-radius: 3px;
		padding: 1px 4px;
		cursor: pointer;
	}
	.move-btn:hover:enabled {
		background-color: gainsboro;
	}
	.move-btn:disabled {
		color: rgba(0, 0, 0, 0.35);
		cursor: default;
	}
	.move-btn.current {
		background-color: var(--accent);
		color: white;
	}
	/* the front/back boundary in the author view's always-complete line;
	   tucked toward what precedes it, spaced from what it introduces */
	.back-divider {
		align-self: center;
		font-size: 0.875rem;
		color: rgba(0, 0, 0, 0.45);
		margin-left: -2px;
		margin-right: 3px;
	}
	/* mid-pair ("1 e4 Back: d5") the following move hugs closer — a button
	   after the marker misses the pair's own tightening rule */
	.move-pair .move-btn + .back-divider {
		margin-right: -2px;
	}
	/* where the boundary can be moved, the marker is the handle */
	.back-divider.draggable {
		position: relative;
		cursor: grab;
		user-select: none;
	}
	/* the handle takes the move line's full height: the text itself is a few
	   pixels tall, and a press that misses it by a hair grabs the board
	   instead and drags that. Absolute, so the line's layout is untouched,
	   and only vertical slack — horizontal would eat into the moves beside
	   it (this element is positioned, so it paints over them) */
	.back-divider.draggable::before {
		content: "";
		position: absolute;
		inset: -7px 0;
	}
	/* at rest past the last move: the line is all front, and the marker is
	   only there to be taken hold of */
	.back-divider.resting {
		color: rgba(0, 0, 0, 0.25);
	}
	.back-divider.draggable:hover,
	.back-divider.dragging {
		color: rgba(0, 0, 0, 0.75);
	}
	.back-divider.dragging {
		cursor: grabbing;
	}
</style>
