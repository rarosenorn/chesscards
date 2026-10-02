<script>
	import { onMount, getContext, untrack } from "svelte"
	import "cm-chessboard/assets/chessboard.css"
	import "cm-chessboard/assets/extensions/arrows/arrows.css"
	import "cm-chessboard/assets/extensions/markers/markers.css"
	import { Chessboard } from "cm-chessboard/src/Chessboard.js"
	import { LayeredArrows } from "$lib/layered-arrows.js"
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
	// true the full line shows and solutionAnnotations add to annotations
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
	// `lines` returns the asides the card's text writes for this board, in
	// reading order, for Shift+arrows to step between.
	let { board, minWidth = "409px", flushBottom = false, revealed = true, authorView = false, onBack = false, number = null, autoFocus = false, inEditor = false, analysis = false, backDots = true, onSolutionFromChange = null, aside = null, onPosition = null, lines = null, children } = $props();

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

	// A board opens where its author set it to (openAt), else at the start of
	// its line; never past what the reveal still hides.
	let openAt = $derived(Math.min(normalized.openAt ?? 0, visiblePlies));
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
	$effect(() => { void board; currentIndex = openAt; following = null; asidePly = null; openedBefore = false; openedAfter = false; });
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
		const key = moves.join(" ");
		const lead = at === 0 || !!lines?.().find(l => l.from === from && l.moves.join(" ") === key)?.lead;
		following = { from, moves, lead };
		asidePly = Math.min(Math.max(at, lead ? 0 : 1), moves.length);
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

	// The line under the board is two rows to begin with, when it is longer
	// than that. They are its last two rows, if the move the board opens on
	// is among them; if not, they start one move before that move, which is
	// then the second move showing. What is left out stands behind a "…" at
	// that end. Asking for it — the "…", or the board stepped into it by any
	// means — shows everything on that side, until the next card. A "…" that
	// has nothing behind it is not there at all, and takes no room. The
	// editors show the line whole: it is what they are editing.
	const folds = $derived(!inEditor && !onSolutionFromChange);
	// the first move showing and the last (null: to the end), and whether
	// each side has been opened
	let foldStart = $state(0);
	let foldEnd = $state(null);
	let openedBefore = $state(false);
	let openedAfter = $state(false);
	// a copy of the whole line, out of sight, that the widths are read from
	let measureEl = $state();
	const ROW_GAP = 6;
	// the board the cuts were last worked out for: until they are this
	// board's, they say nothing about where its moves are
	let placedFor = null;

	// Lays the line out by the widths measured, as the browser will wrap it,
	// to find what two rows hold.
	const placeFold = () => {
		if (!folds || !measureEl || !moveLineEl) return;
		// less the line's own padding, and a little more: the widths read
		// are whole pixels and the real ones are not, and over a row of
		// moves the difference can be the one pixel that wraps a pair
		const width = moveLineEl.clientWidth - 4 - 6;
		placedFor = board;
		const widths = [...measureEl.querySelectorAll(".move-pair")].map(el => el.offsetWidth);
		if (width <= 0 || widths.length === 0 || widths.length !== moveLine.length) { foldStart = 0; foldEnd = null; return; }
		const steps = [...moveLineEl.querySelectorAll(".step-btn")].reduce((sum, el) => sum + el.offsetWidth + ROW_GAP, 4);
		const dots = (measureEl.querySelector(".fold-btn")?.offsetWidth ?? 0) + ROW_GAP;
		// the rows the pairs from `pair` on fall into: [{ pairs, used }]
		const fill = pair => {
			const rows = [{ pairs: [], used: steps + (pair > 0 ? dots : 0) }];
			for (let i = pair; i < widths.length; i++) {
				if (rows.at(-1).used + widths[i] > width && rows.at(-1).pairs.length > 0) rows.push({ pairs: [], used: 0 });
				rows.at(-1).pairs.push(i);
				rows.at(-1).used += widths[i] + ROW_GAP;
			}
			return rows;
		};
		// the last two rows: the earliest pair the rest of the line fits from
		let tail = 0;
		while (tail < widths.length - 1 && fill(tail).length > 2) tail += 1;
		const first = moveLine[tail].moves[0].index;
		const opening = openAt - 1;
		if (tail === 0 || opening >= first) { foldStart = first; foldEnd = null; return; }
		// not among them: from the move before the one the board opens on,
		// two rows' worth, the second ending early enough for its "…"
		const start = Math.max(0, opening - 1);
		const rows = fill(moveLine.findIndex(pair => pair.moves.some(move => move.index >= start)));
		const second = rows[1];
		while (rows.length > 2 && second.pairs.length > 1 && second.used + dots > width) second.used -= widths[second.pairs.pop()] + ROW_GAP;
		foldStart = start;
		foldEnd = rows.length > 2 ? moveLine[second.pairs.at(-1)].moves.at(-1).index : null;
	};
	$effect(() => {
		void moveLine; void openAt;
		if (!measureEl || !moveLineEl) return;
		untrack(placeFold);
		const observer = new ResizeObserver(() => placeFold());
		observer.observe(moveLineEl);
		return () => observer.disconnect();
	});

	// the line as it shows: a pair cut into opens on its black move as a line
	// that Black starts does
	let shownLine = $derived.by(() => {
		const start = folds && !openedBefore ? foldStart : 0;
		const end = folds && !openedAfter && foldEnd != null ? foldEnd : Infinity;
		if (start === 0 && end === Infinity) return moveLine;
		return moveLine
			.map(pair => {
				const moves = pair.moves.filter(move => move.index >= start && move.index <= end);
				return moves.length === pair.moves.length ? pair
					: { ...pair, moves, ellipsis: pair.ellipsis || pair.moves[0].index < start };
			})
			.filter(pair => pair.moves.length > 0);
	});
	let cutBefore = $derived(folds && !openedBefore && foldStart > 0);
	let cutAfter = $derived(folds && !openedAfter && foldEnd != null);

	// the board stepped into what a "…" holds opens that side
	$effect(() => {
		void foldStart; void foldEnd;
		if (!folds || asidePly != null || placedFor !== board) return;
		const at = displayIndex - 1;
		if (cutBefore && at < foldStart) openedBefore = true;
		if (cutAfter && at > foldEnd) openedAfter = true;
	});

	let chessboardElement = $state();
	let cmBoard = $state();
	let renderedBoard = null;

	// the position on the board: the aside's, while one is being followed
	let displayFen = $derived(
		(asidePly != null ? asideReplay?.fens[asidePly] : null) ?? positions[displayIndex]
	);

	// the question's annotations always show, and on reveal the solution
	// layer's add to them; an aside's positions are the text's, and carry none
	// of the line's own marks
	let frontAnnotation = $derived(asidePly != null ? null : normalized.annotations[displayIndex]);
	let backAnnotation = $derived(asidePly != null || !revealed ? null : normalized.solutionAnnotations[displayIndex]);

	// Lichess's analysis board (engine and opening explorer) in a new tab, seen
	// from the side this board is. It is handed the moves, not just the
	// position — the line as far as the card shows it, or the aside being
	// followed — and opened on the move the board stands on, so the game can
	// be stepped through there too. Lichess reads the moves as PGN from the
	// address, where a "+" is a space: the check marks go, and nothing is lost.
	// A line with a move PGN cannot write (one recorded off-turn or by
	// coordinates) is handed over as the position alone, as is anything too
	// long for the address.
	const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
	let analysisUrl = $derived.by(() => {
		const color = normalized.orientation === "b" ? "?color=black" : "";
		const position = `https://lichess.org/analysis/${displayFen.replaceAll(" ", "_")}${color}`;
		const line = following && asidePly != null
			? [...normalized.moves.slice(0, following.from), ...following.moves]
			: normalized.moves.slice(0, visiblePlies);
		const ply = following && asidePly != null ? following.from + asidePly : displayIndex;
		if (line.length === 0 || replay.moveInfos.length < normalized.moves.length
			|| line.some(san => !/^[KQRBNa-hO][\w=+#-]*$/.test(san) || /^[a-h][1-8]-/.test(san))) return position;
		const start = normalized.fen === START_FEN ? "" : `[FEN "${normalized.fen}"] `;
		const pgn = encodeURIComponent(start + line.map(san => san.replace(/[+#]/g, "")).join(" ")).replaceAll("%20", "_");
		return pgn.length > 4500 ? position : `https://lichess.org/analysis/pgn/${pgn}${color}#${ply}`;
	});

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
		const front = frontAnnotation;
		const back = backAnnotation;
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
		showAnnotations(cmBoard, front, back, backDots);
	})

	const boardPrefs = getContext("boardPrefs") ?? (() => DEFAULT_BOARD_PREFS);

	onMount(() => {
		cmBoard = withSpriteCache(boardPrefs().pieceSet, () => new Chessboard(chessboardElement, {
			position: displayFen,
			orientation: normalized.orientation,
			assetsUrl: "/chessboard-assets/", // wherever you copied the assets folder to, could also be in the node_modules folder
			style: boardStyleProps(boardPrefs()),
			extensions: [{ class: LayeredArrows }, { class: Markers }]
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
		// device pixel. The body is observed too: content above growing or
		// shrinking moves the board without resizing it, which would leave
		// a stale nudge.
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
		resizeObserver.observe(document.body);
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
	// the same two, inside an aside. Its ply 0 is the position it branched
	// at, still inside it — but only where the text writes the move reaching
	// it (`following.lead`); otherwise the first move is as far back as it
	// goes, so the board never stands where the text shows nothing. The
	// arrows keep to the line the text wrote, and Shift+arrows (stepLine) are
	// what move between it and the board's own.
	let asideStart = $derived(following?.lead ? 0 : 1);
	const stepAside = ply => {
		playMoveSound(asideMoves[ply > asidePly ? ply - 1 : asidePly - 1]?.san);
		stepping = true;
		asidePly = ply;
	}
	// An aside is a dead end both ways: its last move is the last thing the
	// text claimed, and its start is the first thing it shows.
	let atLineStart = $derived(asidePly != null ? asidePly <= asideStart : displayIndex === 0);
	let atLineEnd = $derived(
		asidePly != null ? asidePly >= asideMoves.length : displayIndex === positions.length - 1
	);
	const previous = () => {
		if (asidePly != null) {
			if (asidePly > asideStart) stepAside(asidePly - 1);
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
	// Up/Down: either end of whichever line the board is on
	const jumpToEnd = end => {
		if (asidePly != null) asidePly = end ? asideMoves.length : asideStart;
		else jumpTo(end ? positions.length - 1 : 0);
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

	// Shift+arrows walk the text's lines as one more line each: the next (or
	// previous) one opens at its start — the lead-in move where the text writes one, so
	// Right plays its first new move — and past either end the board is
	// back on its own line, at the ply it stood on when it left. Jumps, like a
	// click on the text, so unsounded.
	let lineReturn = null;
	const stepLine = dir => {
		const all = (lines?.() ?? []).filter(({ from, moves }) =>
			from <= visiblePlies
			&& replayMoves({ fen: replay.fens[from], moves }).moveInfos.length === moves.length);
		if (all.length === 0) return;
		const current = asidePly != null && following
			? all.findIndex(l => l.from === following.from && l.moves.join(" ") === following.moves.join(" "))
			: -1;
		if (current === -1) lineReturn = displayIndex;
		const target = current === -1 ? (dir > 0 ? 0 : all.length - 1) : current + dir;
		if (target < 0 || target >= all.length) {
			following = null;
			asidePly = null;
			currentIndex = lineReturn ?? displayIndex;
			return;
		}
		followAside({ ...all[target], at: all[target].lead ? 0 : 1 });
	}

	// only reached outside an editor (inEditor boards take no focus, so the
	// arrows are the document's — the virtual board caret's — throughout)
	const handleKeyDown = e => {
		if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
			e.preventDefault();
			stepLine(e.key === "ArrowRight" ? 1 : -1);
		} else if (e.key === "ArrowLeft") {
			e.preventDefault();
			previous();
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			next();
		} else if (e.key === "ArrowUp") {
			// lichess's jump to either end of the line: both are jumps, not
			// steps, so neither is sounded or animated
			e.preventDefault();
			jumpToEnd(false);
		} else if (e.key === "ArrowDown") {
			e.preventDefault();
			jumpToEnd(true);
		}
	}
</script>

{#snippet pairs(list, live)}
	{#each list as pair}
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
					class:current={live && asidePly == null && displayIndex === move.index + 1}
					class:opens-here={inEditor && openAt === move.index + 1}
					disabled={authorView && !revealed && solutionFrom != null && move.index >= solutionFrom}
					onclick={() => jumpTo(move.index + 1)}
				>
					{pair.ellipsis && moveIndex === 0 ? "…" + move.san : move.san}
				</button>
			{/each}
		</span>
	{/each}
{/snippet}

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
		{#if analysis}
			<a class="analysis-link" href={analysisUrl} target="_blank" rel="noopener noreferrer">Analyse</a>
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
			{#if cutBefore}
				<button class="fold-btn" aria-label="Show the earlier moves" onclick={() => openedBefore = true}>…</button>
			{/if}
			{@render pairs(shownLine, true)}
			{#if cutAfter}
				<button class="fold-btn" aria-label="Show the later moves" onclick={() => openedAfter = true}>…</button>
			{/if}
			<!-- The end spot: a line that is all front. Only while the marker is
			     being dragged there — a board with no boundary says so by
			     showing nothing, and the board's own editor is where one is
			     made from scratch. -->
			{#if splitEditable && dragGap != null && shownGap === lineMoves.length}{@render backMarker()}{/if}
		</div>
		{#if folds}
			<!-- the whole line once more, unseen and untouchable: the widths the
			     two rows are worked out from -->
			<div class="move-measure" aria-hidden="true" inert bind:this={measureEl}>
				<span class="fold-btn">…</span>
				{@render pairs(moveLine, false)}
			</div>
		{/if}
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
		/* the line's measuring copy is placed against it */
		position: relative;
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
	/* out at the header's far end, quiet until pointed at: it leaves the card
	   rather than acting on it */
	.analysis-link {
		margin-left: auto;
		padding: 0 6px;
		border-radius: 3px;
		font-size: 0.8rem;
		line-height: 1.3;
		color: rgba(0, 0, 0, 0.55);
		text-decoration: none;
		transition: transform 80ms ease-out;
	}
	.analysis-link:hover {
		background-color: #ebebeb;
		color: black;
		transform: translateY(-1px);
	}
	.analysis-link:active {
		transform: none;
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
	/* the "…" at an end of the line that has more: part of the line, there
	   only when there is something behind it */
	.fold-btn {
		flex: none;
		border: none;
		background-color: transparent;
		border-radius: 3px;
		padding: 1px 4px;
		color: rgba(0, 0, 0, 0.5);
		cursor: pointer;
	}
	button.fold-btn:hover {
		background-color: gainsboro;
	}
	.move-measure {
		position: absolute;
		visibility: hidden;
		pointer-events: none;
		height: 0;
		overflow: hidden;
		display: flex;
		flex-wrap: nowrap;
		width: max-content;
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
	/* where the board opens, for the author writing it: the same bar the
	   board's own editor marks that move with */
	.move-btn.opens-here {
		position: relative;
	}
	/* square-ended and inside the text's height, not the pill's: the button's
	   rounded corners would bend a full-height edge */
	.move-btn.opens-here::before {
		content: "";
		position: absolute;
		left: 0;
		top: 8%;
		bottom: 8%;
		width: 3px;
		background-color: #e0a100;
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
