<script>
	import { onMount, getContext, tick } from "svelte"
	import { playMoveSound } from "$lib/sounds.js"
	import TrashIcon from "$lib/icons/Trash.svelte"
	import CursorArrowIcon from "$lib/icons/CursorArrow.svelte"
	import "cm-chessboard/assets/chessboard.css"
	import "cm-chessboard/assets/extensions/arrows/arrows.css"
	import "cm-chessboard/assets/extensions/markers/markers.css"
	import "cm-chessboard/assets/extensions/promotion-dialog/promotion-dialog.css"
	import { Chessboard, INPUT_EVENT_TYPE } from "cm-chessboard/src/Chessboard.js"
	import { MOVE_CANCELED_REASON } from "cm-chessboard/src/view/VisualMoveInput.js"
	import { Arrows } from "cm-chessboard/src/extensions/arrows/Arrows.js"
	import { Markers, MARKER_TYPE } from "cm-chessboard/src/extensions/markers/Markers.js"
	import { RightClickAnnotator } from "cm-chessboard/src/extensions/right-click-annotator/RightClickAnnotator.js"
	import { PromotionDialog, PROMOTION_DIALOG_RESULT_TYPE } from "cm-chessboard/src/extensions/promotion-dialog/PromotionDialog.js"
	import { isValidFen } from "$lib/isValidFen.js"
	import { FLIPPED_MOVE_PREFIX, flipTurn, looseChess, applyFreeMove, replayMoves, serializeAnnotations, hasAnnotations, showAnnotations } from "$lib/board-utils.js"
	import { DEFAULT_BOARD_PREFS, boardStyleProps, hasBlackBorder, withSpriteCache } from "$lib/board-prefs.js"
	// inlined so the palette's <use href="#wk"> works in Firefox, which doesn't
	// render <use> that references an external SVG file
	import standardSprite from "cm-chessboard/assets/pieces/standard.svg?raw"
	import stauntySprite from "cm-chessboard/assets/pieces/staunty.svg?raw"
	import FlipIcon from "$lib/icons/Flip.svelte"
	import EyeIcon from "$lib/icons/Eye.svelte"
	import EyeOffIcon from "$lib/icons/EyeOff.svelte"

	const boardPrefs = getContext("boardPrefs") ?? (() => DEFAULT_BOARD_PREFS);
	// the palette follows the user's piece set
	const pieceSprite = boardPrefs().pieceSet === "staunty" ? stauntySprite : standardSprite;

	// restore: working state captured by persistState when a still-open editor
	// unmounted; takes precedence over the board's data so the editor resumes
	// exactly where it was (invalid FEN mid-typing included)
	// boardOnBack: the board lives on the card's back — the whole board only
	// shows once the card is turned, so a separate back layer makes no sense;
	// the toggle disappears and everything records as the visible layer
	// startInMoves: the position was pasted in from somewhere else, so there is
	// nothing to set up — open on the moves stage
	let { board: boardData, restore, persistState, onFenValidityChange, onSave, onCancel, boardOnBack = false, startInMoves = false } = $props();

	const emptyPlacement = "8/8/8/8/8/8/8/8"
	const startPlacement = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"

	// svelte-ignore state_referenced_locally -- deliberately captures the board as it was when the editor opened
	const initial = $state.snapshot(boardData);
	// svelte-ignore state_referenced_locally -- deliberately captures the resume point as of mount
	const resume = restore ? $state.snapshot(restore) : null;

	// start-position FEN, bound to the FEN input (setup mode only); a pending
	// invalid FEN typed in the inline input (fenInput) carries into the editor
	let currentFen = $state(resume?.currentFen ?? (initial.fenInput ?? initial.fen).trim());
	let moves = $state(resume ? [...resume.moves] : [...initial.moves]);
	let annotations = $state(resume ? { ...resume.annotations } : { ...initial.annotations });
	let orientation = $state(resume?.orientation ?? initial.orientation ?? "w");
	// solution layer: moves[solutionFrom..] and solutionAnnotations are the
	// answer, hidden in study until the card is turned
	let solutionFrom = $state(resume ? resume.solutionFrom : (initial.solutionFrom ?? null));
	let solutionAnnotations = $state(resume
		? { ...resume.solutionAnnotations }
		: { ...(initial.solutionAnnotations ?? {}) });
	// the recording toggle: while on, recorded moves and drawn annotations go
	// to the back layer; opens on for boards that already have one
	let recordingAnswer = $state(resume
		? resume.recordingAnswer
		: initial.solutionFrom != null || Object.keys(initial.solutionAnnotations ?? {}).length > 0);
	// the view: front = only what the student sees before turning (back moves
	// hidden, front annotations), back = the turned card (full line, back
	// annotations displacing front's). Independent of the recording toggle
	// (though actually recording into a hidden back opens it). Defaults on —
	// authors see the whole card unless they peek at the student view.
	let showBack = $state(resume ? resume.showBack : true);

	let fenIsValid = $derived(isValidFen(currentFen));
	// any valid FEN can record moves — free-form setups (two kings, missing
	// kings, extra pieces) included. Where chess.js can hold the position it
	// provides legal moves and SAN; everywhere else moves apply as free-form
	// coordinates (applyFreeMove), which need no chess.js at all.
	const chessJsRepresentable = fen => {
		try {
			return looseChess(fen).fen().split(" ")[0] === fen.trim().split(/\s+/)[0];
		} catch {
			return false;
		}
	}
	let canRecordMoves = $derived(fenIsValid);

	// report FEN validity live (and revert to valid on unmount) so callers can
	// show which boards block a save
	$effect(() => {
		onFenValidityChange?.(fenIsValid);
		return () => onFenValidityChange?.(true);
	})

	// svelte-ignore state_referenced_locally -- the open-time value, like initial/resume
	let mode = $state(resume?.mode ?? (initial.moves.length > 0 || (startInMoves && isValidFen(currentFen)) ? "moves" : "setup"));
	// position shown in moves mode; editing continues from the last move
	let currentIndex = $state(resume?.currentIndex ?? initial.moves.length);
	let replay = $derived(replayMoves({ fen: currentFen, moves }));
	let positions = $derived(replay.fens);

	// a newly recorded move must be visible: keep the list scrolled to the
	// bottom as it grows (and on open, where editing resumes after the last move)
	let moveListElement = $state();
	$effect(() => {
		void moves.length;
		if (moveListElement) moveListElement.scrollTop = moveListElement.scrollHeight;
	});

	// the board's committed start FEN — always valid, unlike currentFen, which
	// may be invalid mid-typing
	let acceptedFen = resume?.acceptedFen ?? initial.fen.trim();

	// Drops the recorded moves (they no longer apply once the start position
	// changes), keeping only the set position and its annotations (both layers).
	const clearMoves = () => {
		if (moves.length === 0) return;
		moves = [];
		// annotations on later positions are meaningless without the moves
		annotations = annotations[0] ? { 0: annotations[0] } : {};
		solutionAnnotations = solutionAnnotations[0] ? { 0: solutionAnnotations[0] } : {};
		solutionFrom = null;
		currentIndex = 0;
	}

	const syncFenFromBoard = () => {
		const rest = currentFen.trim().split(/\s+/).slice(1).join(" ") || "w KQkq - 0 1";
		currentFen = board.getPosition() + " " + rest;
		acceptedFen = currentFen;
	}

	// a pasted FEN is a position from elsewhere: nothing left to set up, so the
	// editor moves on to recording. Typing the same characters must not switch
	// mid-FEN, hence the flag rather than a check inside handleFenInput
	let fenPasted = false;
	const handleFenPaste = () => { fenPasted = true; }

	const handleFenInput = () => {
		clearMoves();
		if (isValidFen(currentFen)) {
			acceptedFen = currentFen;
			board.setPosition(currentFen.trim().split(/\s+/)[0], false);
			if (fenPasted) {
				switchMode("moves");
				// the FEN input disables itself in moves mode, and disabling the
				// focused element drops focus to <body> — the board takes it, as
				// it does for a freshly opened editor, so arrows and the wheel
				// keep stepping without a click
				tick().then(() => boardElement?.focus({ preventScroll: true }));
			}
		}
		fenPasted = false;
	}

	const setPlacement = placement => {
		clearMoves();
		// setup-stage position changes are always instant
		board.setPosition(placement, false);
		syncFenFromBoard();
	}

	const flipBoard = () => {
		orientation = orientation === "w" ? "b" : "w";
		board.setOrientation(orientation);
	}

	const paletteRows = [
		["wk", "wq", "wr", "wb", "wn", "wp"],
		["bk", "bq", "br", "bb", "bn", "bp"]
	]
	const pieceNames = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
	const pieceLabel = piece => `${piece[0] === "w" ? "White" : "Black"} ${pieceNames[piece[1]]}`;

	let boardElement;
	let board = $state();
	// piece name like "wq", "trash", or null (null = drag pieces on the board)
	let selectedTool = $state(null);

	// set by validateMoveInput, committed by moveInputFinished
	let pendingSan = null;
	let pendingFen = null;
	// a promotion is committed later, once the dialog picks the piece
	let pendingPromotion = null;

	const commitMove = (san, fen) => {
		playMoveSound(san);
		// recording for the back must show it — otherwise the move would
		// vanish into the hidden layer the moment it lands
		if (recordingAnswerEffective) showBack = true;
		// playing a move mid-list replaces everything after this position
		moves = [...moves.slice(0, currentIndex), san];
		for (const key of Object.keys(annotations)) {
			if (Number(key) > currentIndex) delete annotations[key];
		}
		for (const key of Object.keys(solutionAnnotations)) {
			if (Number(key) > currentIndex) delete solutionAnnotations[key];
		}
		if (recordingAnswerEffective) {
			// the answer starts at the first answer move
			if (solutionFrom == null || solutionFrom > currentIndex) solutionFrom = currentIndex;
		} else {
			// a question move replaces the answer moves that followed it — a
			// changed question invalidates the recorded solution
			solutionFrom = null;
		}
		currentIndex += 1;
		// render from chess.js so promotion/castling/en passant show correctly
		board.setPosition(fen, false);
	}

	const handleMoveInput = event => {
		// a piece picked up by CLICK (not held): the flags below are reset
		// before the setup handling runs, so capture it here
		const wasClickMove = clickMoving;
		// drag cursor lifecycle: closed hand for the whole drag (any square),
		// back to open hand right at the drop — the hover state is recomputed
		// for the drop square after the position commits, so the cursor is
		// correct before the mouse even moves again
		if (event.type === INPUT_EVENT_TYPE.moveInputStarted) {
			draggingPiece = true;
			clickMoving = false;
			// highlight the picked-up piece's square (also covers click-move,
			// where the selection outlives the press); safe in setup too now
			// that showAnnotations only wipes its own marker types
			board.addMarker(MARKER_TYPE.square, event.squareFrom);
		}
		if (event.type === INPUT_EVENT_TYPE.moveInputFinished || event.type === INPUT_EVENT_TYPE.moveInputCanceled) {
			draggingPiece = false;
			clickMoving = false;
			board.removeMarkers(MARKER_TYPE.square);
			setTimeout(() => {
				hoverPiece = !!(event.squareTo && board.getPiece(event.squareTo));
			}, 0);
		}
		if (mode === "setup") {
			switch (event.type) {
				case INPUT_EVENT_TYPE.moveInputStarted:
					clearMoves();
					return true;
				case INPUT_EVENT_TYPE.validateMoveInput:
					return true;
				case INPUT_EVENT_TYPE.moveInputCanceled:
					// DRAGGING a piece off the board removes it; clicking a
					// piece and then clicking away just cancels — same event,
					// so the gesture decides
					if (event.reason === MOVE_CANCELED_REASON.movedOutOfBoard && event.squareFrom && !wasClickMove) {
						board.setPiece(event.squareFrom, null);
					}
					syncFenFromBoard();
					break;
				case INPUT_EVENT_TYPE.moveInputFinished:
					syncFenFromBoard();
			}
			return;
		}
		// moves mode: legal moves from the shown position, auto-queen promotion.
		// Either side may move: a piece of the side not to move gets the turn
		// flipped first, and the move is stored with the flipped-move prefix so
		// replay repeats the flip.
		switch (event.type) {
			case INPUT_EVENT_TYPE.moveInputStarted:
				return true;
			case INPUT_EVENT_TYPE.validateMoveInput: {
				pendingSan = null;
				pendingFen = null;
				pendingPromotion = null;
				const currentPosition = positions[currentIndex];
				if (chessJsRepresentable(currentPosition)) {
					try {
						const chess = looseChess(currentPosition);
						const piece = chess.get(event.squareFrom);
						const flipped = !!piece && piece.color !== chess.turn();
						if (flipped) chess.load(flipTurn(chess.fen()), { skipValidation: true });
						const move = chess.move({ from: event.squareFrom, to: event.squareTo, promotion: "q" });
						if (move.promotion) {
							pendingPromotion = { from: event.squareFrom, to: event.squareTo, flipped, color: move.color };
						} else {
							pendingSan = flipped ? FLIPPED_MOVE_PREFIX + move.san : move.san;
							pendingFen = chess.fen();
						}
						return true;
					} catch {
						// falls through to the free-form path below
					}
				}
				// positions chess.js can't hold (two same-color kings) and
				// moves it refuses (into check, ...) apply as free-form
				// coordinate moves, stored as "e2-e4"
				const result = applyFreeMove(currentPosition, event.squareFrom, event.squareTo);
				if (!result) return false;
				pendingSan = `${event.squareFrom}-${event.squareTo}`;
				pendingFen = result.fen;
				return true;
			}
			case INPUT_EVENT_TYPE.moveInputFinished:
				if (event.legalMove && pendingPromotion) {
					const { from, to, flipped, color } = pendingPromotion;
					board.showPromotionDialog(to, color, result => {
						if (result?.type === PROMOTION_DIALOG_RESULT_TYPE.pieceSelected) {
							const chess = looseChess(positions[currentIndex]);
							if (flipped) chess.load(flipTurn(chess.fen()), { skipValidation: true });
							const move = chess.move({ from, to, promotion: result.piece.charAt(1) });
							commitMove(flipped ? FLIPPED_MOVE_PREFIX + move.san : move.san, chess.fen());
						} else {
							// canceled: take the visually placed pawn back
							board.setPosition(positions[Math.min(currentIndex, viewLimit)], false);
						}
					});
				} else if (event.legalMove && pendingSan) {
					commitMove(pendingSan, pendingFen);
				}
				pendingSan = null;
				pendingFen = null;
				pendingPromotion = null;
		}
	}

	const handleSquareClick = ({ square, event }) => {
		// left button only — the right button belongs to the annotator
		if (event.button !== 0) return;
		if (!square || !selectedTool || mode !== "setup") return;
		clearMoves();
		board.setPiece(square, selectedTool === "trash" ? null : selectedTool);
		syncFenFromBoard();
	}

	const selectTool = tool => {
		selectedTool = selectedTool === tool ? null : tool;
		// dragging conflicts with click-to-place, so only one is active at a time
		if (selectedTool && board.isMoveInputEnabled()) {
			board.disableMoveInput();
		} else if (!selectedTool && !board.isMoveInputEnabled()) {
			board.enableMoveInput(handleMoveInput);
		}
	}

	let configuredAnimationMs;
	const syncAnimationSpeed = () =>
		// 1ms, not 0: at 0 the animation queue drops the final frame and
		// pieces vanish from the view after a move
		board.props.style.animationDuration = mode === "setup" ? 1 : configuredAnimationMs;

	const switchMode = newMode => {
		if (newMode === mode) return;
		if (newMode === "moves" && !canRecordMoves) return;
		if (selectedTool) selectTool(selectedTool);
		mode = newMode;
		syncAnimationSpeed();
		if (mode === "moves") {
			currentIndex = Math.min(currentIndex, viewLimit);
		} else {
			board.setPosition(currentFen.trim().split(/\s+/)[0], false);
		}
	}

	// the last position reachable in the current view: the front view stops
	// at the back layer's boundary, the back view spans the whole line
	let viewLimit = $derived(
		showBack || solutionFrom == null ? moves.length : Math.min(solutionFrom, moves.length)
	);

	// index of the position annotations are attached to right now
	let annotationIndex = $derived(mode === "setup" ? 0 : Math.min(currentIndex, viewLimit));

	// Beyond the back's start every position is back territory: anything
	// recorded there continues the back line, so the toggle locks on there
	// instead of silently converting the hidden line into visible front moves.
	let answerLocked = $derived(
		solutionFrom != null && mode === "moves" && Math.min(currentIndex, viewLimit) > solutionFrom
	);
	let recordingAnswerEffective = $derived(!boardOnBack && (recordingAnswer || answerLocked));

	// the toggle only routes recordings; the eye opens by itself the moment
	// something is actually recorded into the back (commitMove / capture)
	const setRecording = back => {
		recordingAnswer = back;
	}

	// hiding the back pulls the shown position back inside the front view;
	// the recording toggle is left alone — the eye is only a view
	const setShowBack = on => {
		showBack = on;
		if (!on && solutionFrom != null) currentIndex = Math.min(currentIndex, solutionFrom);
	}

	// for the card editor's T shortcut
	export const toggleAnswer = () => {
		if (!boardOnBack && !answerLocked) setRecording(!recordingAnswer);
	}
	// The eye governs what the board shows: back view = the turned card
	// (back annotations displacing the front's per position), front view =
	// front only. Drawn edits apply to the set being displayed — a position
	// showing back annotations writes back to the back layer even while
	// recording the front, so a capture can never copy back arrows into the
	// front; fresh sets go to the recording toggle's layer.
	let displayedAnnotation = $derived(showBack && !boardOnBack
		? solutionAnnotations[annotationIndex] ?? annotations[annotationIndex]
		: annotations[annotationIndex]);
	const annotationTarget = () =>
		!boardOnBack && (recordingAnswerEffective || (showBack && solutionAnnotations[annotationIndex]))
			? solutionAnnotations
			: annotations;

	// Move-list rows, numbered sequentially (the FEN fullmove counter doesn't
	// advance for flipped/manual moves): a black move joins the preceding row
	// when that row has a white move and no black one yet; otherwise (black
	// moving repeatedly, or a start position with black to move) it gets its
	// own row with an ellipsis in the white column. Each entry keeps its move
	// index so clicking can select the resulting position.
	let moveRows = $derived.by(() => {
		const rows = [];
		let number = 0;
		replay.moveInfos.forEach(({ san, color }, index) => {
			const move = { san, index };
			const last = rows[rows.length - 1];
			// a black move joins the preceding row unless the back begins on
			// it — rows never span the front/back boundary, so the divider
			// can always sit between rows. Such a split row continues its
			// move: it keeps the number ("1 e4 / Back / 1 … d5").
			const continuesLast = color === "b" && last?.white && !last.black;
			if (continuesLast && index !== solutionFrom) {
				last.black = move;
			} else {
				if (!continuesLast) number += 1;
				rows.push({
					number,
					white: color === "w" ? move : null,
					black: color === "b" ? move : null
				});
			}
		});
		return rows;
	});

	// the whole line is always listed; back moves are only clickable while
	// the eye shows the back (the board never displays what the eye hides)
	const moveIsBack = index => solutionFrom != null && index >= solutionFrom;

	// the annotator draws on right-click; capture its state after the event settles.
	// getArrows/getMarkers instead of getAnnotations: cm-chessboard 8.12.12 binds
	// getAnnotations to the wrong object, making it throw
	const captureAnnotations = () => setTimeout(() => {
		if (!board?.getArrows || !board?.getMarkers) return;
		const annotation = serializeAnnotations({
			arrows: board.getArrows(),
			markers: board.getMarkers()
		});
		const target = annotationTarget();
		if (hasAnnotations(annotation)) {
			target[annotationIndex] = annotation;
			// recording for the back must show it — otherwise the drawing
			// would vanish into the hidden layer the moment it is captured
			if (target === solutionAnnotations) showBack = true;
		} else {
			delete target[annotationIndex];
		}
	})

	// keep the board and drawn annotations in sync with the viewed position
	// (and the view: front/back switches which layer is shown)
	$effect(() => {
		if (!board) return;
		if (mode === "moves") {
			board.setPosition(positions[Math.min(currentIndex, viewLimit)], true);
		}
		showAnnotations(board, displayedAnnotation);
	})

	// Pressing the board must move pieces, never start an item drag: the
	// dnd library's drag listener sits on the surrounding card item, so keep
	// board presses from bubbling to it. Plain stopPropagation (bubble phase,
	// on the board itself) leaves cm-chessboard's own listeners unaffected.
	// preventDefault keeps focus where it is (the add-cards document), the
	// same way the menu bar's buttons do — cm-chessboard's input runs on
	// pointer events and doesn't need the mouse default.
	const stopDndPress = e => {
		e.stopPropagation();
		e.preventDefault();
	}

	// pointer only over squares holding a piece (or always, while a palette
	// tool is selected): the library's blanket input-enabled pointer is
	// overridden in CSS, keyed on the pointer-squares class below.
	// With a tool selected, a translucent ghost of it follows the cursor
	// (lichess-style), so you see what you're about to place.
	let hoverPiece = $state(false);
	let draggingPiece = $state(false);
	// the drag ghost rides the pointer over whatever happens to be beneath it
	// (palette gaps, board margins), so the closed hand comes from a
	// page-wide override for the drag's duration
	$effect(() => {
		document.body.classList.toggle("piece-grabbing", draggingPiece);
		return () => document.body.classList.remove("piece-grabbing");
	});
	// a piece was click-selected (pressed and released in place) and awaits a
	// destination click — pointer, not the drag cursors, until then
	let clickMoving = $state(false);

	// pointerup (the library's finish/cancel path) always precedes mouseup, so
	// if the press ends with move input still live, it was a click-select
	const handleBoardMouseUp = () => {
		if (draggingPiece) {
			draggingPiece = false;
			clickMoving = true;
		}
	}
	let ghostPos = $state(null);
	const handleBoardHoverCursor = e => {
		const square = e.target.closest?.("[data-square]")?.getAttribute("data-square");
		hoverPiece = !!(square && board.getPiece(square));
		if (selectedTool) {
			const rect = boardElement.getBoundingClientRect();
			ghostPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
		} else {
			ghostPos = null;
		}
	}
	const clearHoverCursor = () => {
		hoverPiece = false;
		ghostPos = null;
	}

	onMount(() => {
		board = withSpriteCache(boardPrefs().pieceSet, () => new Chessboard(boardElement, {
			// acceptedFen, not currentFen: a restored FEN may be invalid
			// mid-typing; the board shows the last accepted position
			position: acceptedFen,
			orientation,
			assetsUrl: "/chessboard-assets/",
			style: boardStyleProps(boardPrefs()),
			// autoMarkers off: no corner frames on origin/destination; the
			// picked-up piece's square gets a background marker instead (below)
			extensions: [{ class: Arrows }, { class: Markers, props: { autoMarkers: null } }, { class: RightClickAnnotator }, { class: PromotionDialog }]
		}))
		// in the setup stage every piece movement is instant; recorded-move
		// playback in the moves stage keeps the configured animation
		configuredAnimationMs = board.props.style.animationDuration;
		syncAnimationSpeed();
		board.enableMoveInput(handleMoveInput);
		board.enableSquareSelect("pointerdown", handleSquareClick);
		boardElement.addEventListener("mousedown", stopDndPress);
		boardElement.addEventListener("touchstart", stopDndPress);
		boardElement.addEventListener("mouseup", captureAnnotations);
		boardElement.addEventListener("mouseup", handleBoardMouseUp);
		boardElement.addEventListener("mousemove", handleBoardHoverCursor);
		boardElement.addEventListener("mouseleave", clearHoverCursor);
		boardElement.addEventListener("wheel", handleWheel, { passive: false });
		// the FEN row matches the board's whole-pixel rendered width (border
		// included) instead of overhanging it; offsetWidth + outer observation
		// for the same transform/replacement reasons as Chessboard.svelte
		const syncWidth = () => boardElement.closest(".board-column").style.setProperty(
			"--board-px", boardElement.firstElementChild.offsetWidth + "px"
		);
		syncWidth();
		const resizeObserver = new ResizeObserver(syncWidth);
		resizeObserver.observe(boardElement.firstElementChild);
		resizeObserver.observe(boardElement);
		return () => {
			resizeObserver.disconnect();
			boardElement.removeEventListener("mousedown", stopDndPress);
			boardElement.removeEventListener("touchstart", stopDndPress);
			boardElement.removeEventListener("mouseup", captureAnnotations);
			boardElement.removeEventListener("mouseup", handleBoardMouseUp);
			boardElement.removeEventListener("mousemove", handleBoardHoverCursor);
			boardElement.removeEventListener("mouseleave", clearHoverCursor);
			boardElement.removeEventListener("wheel", handleWheel);
			board.destroy();
			// hand the working state to the parent; it only keeps it if the
			// editor is still open (not unmounting because of Ok/Cancel)
			persistState?.({
				currentFen,
				moves: $state.snapshot(moves),
				annotations: $state.snapshot(annotations),
				solutionFrom,
				solutionAnnotations: $state.snapshot(solutionAnnotations),
				recordingAnswer,
				showBack,
				orientation,
				mode,
				currentIndex,
				acceptedFen
			});
		}
	})

	// The applied board data; parents use this to auto-apply open editors on
	// submit. An invalid FEN is never committed as the board's fen — it rides
	// along as fenInput (pending text) for the card validators to catch.
	export const getBoardData = () => ({
		fen: isValidFen(currentFen) ? currentFen : acceptedFen,
		fenInput: isValidFen(currentFen) ? undefined : currentFen,
		moves: $state.snapshot(moves),
		annotations: $state.snapshot(annotations),
		solutionFrom,
		solutionAnnotations: $state.snapshot(solutionAnnotations),
		orientation
	});

	const save = () => onSave(getBoardData())

	// stepping forward sounds the move being made, stepping back the move
	// being unmade (both are the move crossed between the two positions)
	const goToIndex = index => {
		const from = Math.min(currentIndex, viewLimit);
		if (index !== from) {
			const crossed = index > from ? index - 1 : from - 1;
			playMoveSound(replay.moveInfos[crossed]?.san);
		}
		currentIndex = index;
	}

	const handleKeyDown = e => {
		if (mode !== "moves" || e.target.tagName === "INPUT") return;
		if (e.key === "ArrowLeft") {
			e.preventDefault();
			goToIndex(Math.max(Math.min(currentIndex, viewLimit) - 1, 0));
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			goToIndex(Math.min(currentIndex + 1, viewLimit));
		}
	}

	// in moves mode the recorder owns arrow presses from inside the editor:
	// handle them here and keep them from bubbling on to the block editor's
	// virtual-caret keymap (in an add-cards board island, ProseMirror sits
	// above us in the DOM and would step the caret too)
	const claimArrows = e => {
		if (mode !== "moves" || e.target.tagName === "INPUT") return;
		if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
			e.stopPropagation();
			handleKeyDown(e);
		}
	}

	// scroll steps through the moves like on the card boards (lichess-style);
	// deltas accumulate so trackpads don't fire a step per micro-tick, and
	// page scroll is swallowed over the board while it has moves to step.
	// Attached manually: svelte's wheel handlers are passive, which forbids
	// preventDefault.
	let wheelAcc = 0;
	let lastWheel = 0;
	const handleWheel = e => {
		if (mode !== "moves" || viewLimit === 0) return;
		e.preventDefault();
		const now = performance.now();
		if (now - lastWheel > 250) wheelAcc = 0;
		lastWheel = now;
		wheelAcc += e.deltaY;
		if (wheelAcc > 40) {
			goToIndex(Math.min(currentIndex + 1, viewLimit));
			wheelAcc = 0;
		} else if (wheelAcc < -40) {
			goToIndex(Math.max(Math.min(currentIndex, viewLimit) - 1, 0));
			wheelAcc = 0;
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<!-- hidden sprite the palette's <use href="#..."> references (see import) -->
<div class="sprite-host" aria-hidden="true">{@html pieceSprite}</div>

<!-- svelte-ignore a11y_no_static_element_interactions -- keyboard routing, not an interactive control -->
<div class="editor" onkeydown={claimArrows}>
	<div class="board-column">
		<div class="ghost-host">
			<!-- focusable (tabindex -1) so a freshly opened editor can receive
			     focus on the board itself without scrolling to the FEN input -->
			<div
				class="board"
				class:black-border={hasBlackBorder(boardPrefs())}
				class:tool-squares={selectedTool !== null}
				class:pointer-squares={clickMoving}
				class:grab-squares={hoverPiece && selectedTool === null && !clickMoving}
				class:grabbing-squares={draggingPiece}
				tabindex="-1"
				bind:this={boardElement}
			></div>
			{#if ghostPos && selectedTool}
				<div
					class="tool-ghost"
					class:trash-ghost={selectedTool === "trash"}
					style:left={ghostPos.x + "px"}
					style:top={ghostPos.y + "px"}
				>
					{#if selectedTool === "trash"}
						<span class="ghost-tool"><TrashIcon /></span>
					{:else}
						<svg class="ghost-tool" viewBox="0 0 40 40"><use href="#{selectedTool}" /></svg>
					{/if}
				</div>
			{/if}
		</div>
		<div class="fen-row">
			<input
				class="fen-input"
				class:invalid={!fenIsValid}
				bind:value={currentFen}
				oninput={handleFenInput}
				onpaste={handleFenPaste}
				disabled={mode === "moves"}
				title={mode === "moves" ? "Switch to Set position to edit the start FEN" : ""}
			/>
			<button class="std-btn flip-btn" onclick={flipBoard}><FlipIcon /></button>
			{#if !boardOnBack}
				<button
					class="std-btn show-back-btn"
					aria-pressed={showBack}
					onclick={() => setShowBack(!showBack)}
				>
					{#if showBack}<EyeIcon />{:else}<EyeOffIcon />{/if}
					<span>Back</span>
				</button>
			{/if}
		</div>
	</div>
	<div class="side-panel">
		<!-- Above the stages: which side recorded moves and drawn annotations
		     belong to; it governs both editor stages. A board on the card's
		     back is hidden as a whole, so it has no separate back layer and
		     the control disappears. -->
		{#if !boardOnBack}
		<div class="layer-row">
			<span
				class="layer-label"
				id="layer-label"
				title="Moves and annotations for back will appear when card is turned"
			>
				Moves and annotations for
			</span>
			<div class="layer-segments" role="radiogroup" aria-labelledby="layer-label" title="Shortcut key: t">
				<button
					role="radio"
					aria-checked={!recordingAnswerEffective}
					class:selected={!recordingAnswerEffective}
					disabled={answerLocked}
					onclick={() => setRecording(false)}
				>
					Front
				</button>
				<button
					role="radio"
					aria-checked={recordingAnswerEffective}
					class:selected={recordingAnswerEffective}
					onclick={() => setRecording(true)}
				>
					Back
				</button>
			</div>
		</div>
		{/if}
		<!-- the two stages as peer modes: set up a position, record moves on it -->
		<div class="stage-segments" role="tablist" aria-label="Editor stage">
			<button
				role="tab"
				aria-selected={mode === "setup"}
				class:selected={mode === "setup"}
				onclick={() => switchMode("setup")}
			>
				<span class="step-number">(1)</span> Set position
			</button>
			<button
				role="tab"
				aria-selected={mode === "moves"}
				class:selected={mode === "moves"}
				disabled={!canRecordMoves}
				title={canRecordMoves ? "" : "Enter a valid FEN to record moves"}
				onclick={() => switchMode("moves")}
			>
				<span class="step-number">(2)</span> Moves
			</button>
		</div>
		{#if mode === "setup"}
			<div class="palette">
				{#each paletteRows as row}
					<div class="palette-row">
						{#each row as piece}
							<button
								class="palette-piece"
								class:selected={selectedTool === piece}
								aria-label={pieceLabel(piece)}
								onclick={() => selectTool(piece)}
							>
								<svg viewBox="0 0 40 40">
									<use href="#{piece}" />
								</svg>
							</button>
						{/each}
					</div>
				{/each}
				<div class="tool-row">
					<button
						class="palette-piece trash"
						class:selected={selectedTool === "trash"}
						onclick={() => selectTool("trash")}
					>
						<TrashIcon />
					</button>
					<button
						class="palette-piece"
						class:selected={selectedTool === null}
						onclick={() => selectTool(null)}
					>
						<CursorArrowIcon />
					</button>
				</div>
			</div>
			<div class="position-buttons">
				<button class="std-btn" onclick={() => setPlacement(startPlacement)}>Start position</button>
				<button class="std-btn" onclick={() => setPlacement(emptyPlacement)}>Clear board</button>
			</div>
		{:else}
			<div class="move-list" bind:this={moveListElement}>
				{#each moveRows as row}
					{#if solutionFrom != null && (row.white?.index ?? row.black?.index) === solutionFrom}
						<div class="back-divider"><span>Back</span></div>
					{/if}
					<div class="move-row">
						<span class="move-number">{row.number}</span>
						{#if row.white}
							<button
								class="move-btn"
								class:current={Math.min(currentIndex, viewLimit) === row.white.index + 1}
								disabled={!showBack && moveIsBack(row.white.index)}
								onclick={() => goToIndex(row.white.index + 1)}
							>
								{row.white.san}
							</button>
						{:else}
							<span class="move-btn ellipsis">...</span>
						{/if}
						{#if row.black}
							<button
								class="move-btn"
								class:current={Math.min(currentIndex, viewLimit) === row.black.index + 1}
								disabled={!showBack && moveIsBack(row.black.index)}
								onclick={() => goToIndex(row.black.index + 1)}
							>
								{row.black.san}
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
		<div class="actions">
			<button class="std-btn" onclick={onCancel}>Cancel</button>
			<button class="std-btn" onclick={save}>Save</button>
		</div>
	</div>
</div>

<style>
	.sprite-host {
		display: none;
	}
	/* the dialog auto-focuses its first option (queen) and strokes it, which
	   looks like a divider between queen and rook; hover still highlights */
	:global(svg.cm-chessboard .promotion-dialog-group .promotion-dialog-button-group:focus .promotion-dialog-button) {
		stroke: none;
	}
	.editor {
		position: relative;
		width: 100%;
	}
	.board-column {
		/* reserves the side panel's 300px + 20px gutter */
		margin-right: 320px;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.board {
		border-radius: 2px 2px 0 0;
	}
	/* programmatic focus target only (tabindex -1); no visible ring */
	.board:focus {
		outline: none;
	}
	/* the picked-up piece's square: yellow fill, not the default faint black */
	/* fully opaque: a translucent fill blends differently with light and
	   dark squares, making the highlight look inconsistent */
	.board :global(.cm-chessboard .markers .marker.marker-square) {
		fill: #ffff33;
		opacity: 1;
	}
	/* the library puts a pointer on every input-enabled square; instead:
	   pointer while a palette tool is selected (clicking any square acts),
	   grab over draggable pieces, default otherwise */
	.board :global(.cm-chessboard .board.input-enabled .square) {
		cursor: default;
	}
	/* with a tool selected the native cursor disappears over the board: the
	   ghost's own arrow replaces it (lichess-style). Every element too —
	   squares and pieces carry their own cursor rules, which would sit on
	   top of the ghost (an element's cursor beats an inherited none) */
	.board.tool-squares :global(.cm-chessboard),
	.board.tool-squares :global(.cm-chessboard *) {
		cursor: none;
	}
	/* during a click-move the next click acts, so the whole board shows a
	   pointer; the input-enabled variant matches the default-cursor rule's
	   specificity, which would otherwise win while move input is live */
	.board.pointer-squares :global(.cm-chessboard .square),
	.board.pointer-squares :global(.cm-chessboard .board.input-enabled .square) {
		cursor: pointer;
	}
	/* preview of the selected tool riding the cursor: an arrow whose tip sits
	   at the actual pointer position, with the translucent tool below-right;
	   never intercepts the clicks that place/remove pieces */
	.ghost-host {
		position: relative;
	}
	.tool-ghost {
		position: absolute;
		pointer-events: none;
		z-index: 3;
		width: calc(var(--board-px, 400px) / 8 * 0.8);
		height: calc(var(--board-px, 400px) / 8 * 0.8);
		/* the pointer position is the ghost's center */
		transform: translate(-50%, -50%);
	}
	.tool-ghost .ghost-tool {
		position: absolute;
		left: 0;
		top: 0;
		width: 100%;
		height: 100%;
		max-width: none;
		opacity: 0.65;
	}
	.tool-ghost svg.ghost-tool {
		display: block;
	}
	.tool-ghost.trash-ghost .ghost-tool {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.4rem;
		color: #333;
	}
	.board.grab-squares :global(.cm-chessboard .board.input-enabled .square) {
		cursor: grab;
	}
	/* last so an active drag beats the hover/tool cursors */
	.board.grabbing-squares :global(.cm-chessboard .board.input-enabled .square) {
		cursor: grabbing;
	}
	/* border on the whole-pixel inner box so the frame hugs the board; the
	   dark background makes rasterization slack at fractional zoom read as
	   border, not white. The FEN bar overlaps 2px, so the bottom border is
	   widened to keep 2px visible. See Chessboard.svelte. */
	.board.black-border > :global(div) {
		border: 2px solid #404040;
		background-color: #404040;
		border-radius: 2px 2px 0 0;
		border-bottom-width: 4px;
	}
	.board > :global(div) {
		margin: 0 auto;
	}
	.fen-row {
		display: flex;
		/* matches the board's rendered width; the -1px covers the
		   sub-device-pixel seam Chromium can open at fractional zoom */
		width: var(--board-px, 100%);
		box-sizing: border-box;
		margin: -1px auto 0 auto;
		position: relative;
	}
	.board-column:has(.board.black-border) .fen-row {
		margin-top: -2px;
	}
	.fen-input {
		flex-grow: 1;
		min-width: 0;
		border: 1px solid lightgrey;
		border-bottom: 1px solid darkgrey;
		background-color: #f5f5f5;
		border-radius: 0;
		padding: 3px 6px;
	}
	/* the buttons overlap the input by 1px (the shared-border trick) and
	   paint after it, so a focused input must rise above them or its ring
	   is clipped on the right */
	.fen-input:focus,
	.fen-input:focus-visible {
		position: relative;
		z-index: 1;
	}
	/* joins the FEN bar seamlessly: shared border via the -1px overlap */
	.flip-btn,
	.show-back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0;
		margin-left: -1px;
	}
	.flip-btn {
		padding: 3px 30px;
	}
	/* fixed width so the eye toggling open/closed never shifts the bar;
	   font matches the saved boards' bar buttons (their default size) */
	.show-back-btn {
		width: 84px;
		padding: 3px 0;
		gap: 5px;
		white-space: nowrap;
	}
	.fen-input:disabled {
		color: rgba(0, 0, 0, 0.4);
	}
	.fen-input.invalid {
		border: 1px solid #c00;
		outline-color: #c00;
	}
	/* numbered wizard steps on a full-width track: the circled numbers carry
	   the order, the active step lifts white with a dark-filled number */
	.stage-segments {
		display: flex;
		background-color: #e6e6e6;
		border-radius: 6px;
		padding: 2px;
	}
	.stage-segments button {
		flex: 1 1 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 3px 4px;
		border: none;
		border-radius: 4px;
		background-color: transparent;
		color: rgba(0, 0, 0, 0.5);
		font-size: 0.9rem;
		cursor: pointer;
	}
	.step-number {
		font-size: 0.8rem;
		color: rgba(0, 0, 0, 0.45);
	}
	.stage-segments button:hover:enabled:not(.selected) {
		color: black;
		background-color: rgba(0, 0, 0, 0.05);
	}
	/* the std-btn key press, borrowed for the segments: the tab dips 1px,
	   instantly (no transition), and a selected one's depth flattens away */
	.stage-segments button:active:enabled {
		transform: translateY(1px);
	}
	.stage-segments button.selected:active:enabled {
		box-shadow: none;
	}
	.stage-segments button.selected {
		background-color: white;
		box-shadow: rgba(0, 0, 0, 0.18) 0 1px 2px;
		color: black;
		font-weight: 500;
	}
	.stage-segments button.selected .step-number {
		color: rgba(0, 0, 0, 0.7);
	}
	.stage-segments button:disabled {
		color: rgba(0, 0, 0, 0.3);
		cursor: default;
	}
	.stage-segments button:disabled .step-number {
		color: rgba(0, 0, 0, 0.3);
	}
	/* which side receives recordings: label and Front|Back segments on one
	   line, together spanning the same width as the stage tabs below */
	/* sits a touch closer to the tabs than the panel's default gap */
	.layer-row {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: -4px;
	}
	/* bare text next to a boxed control reads left-shifted; the small indent
	   optically aligns the label with the tabs' left edge. The dashed
	   underline is the has-a-tooltip convention. */
	.layer-label {
		padding-left: 2px;
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.6);
		white-space: nowrap;
		text-decoration: underline dashed rgba(0, 0, 0, 0.35);
		text-underline-offset: 3px;
		cursor: help;
	}
	.layer-segments {
		flex: 1 1 0;
		display: flex;
		gap: 2px;
		background-color: #e6e6e6;
		border-radius: 999px;
		padding: 2px;
	}
	.layer-segments button {
		flex: 1 1 0;
		padding: 2px 0;
		border: none;
		border-radius: 999px;
		background-color: transparent;
		color: rgba(0, 0, 0, 0.55);
		font-size: 0.85rem;
		cursor: pointer;
	}
	.layer-segments button:hover:enabled:not(.selected) {
		color: black;
		background-color: rgba(0, 0, 0, 0.05);
	}
	/* same press as the stage tabs above */
	.layer-segments button:active:enabled {
		transform: translateY(1px);
	}
	.layer-segments button.selected:active:enabled {
		box-shadow: none;
	}
	.layer-segments button.selected {
		background-color: white;
		box-shadow: rgba(0, 0, 0, 0.18) 0 1px 2px;
		color: black;
	}
	.layer-segments button:disabled {
		color: rgba(0, 0, 0, 0.3);
		cursor: default;
	}
	/* pinned to the board column's height, so a long move list scrolls inside
	   the panel (.move-list) instead of growing the editor */
	/* inset from the editor edge so the panel column sits centered between
	   the board and the editor's right edge (10px gutter on both sides) */
	.side-panel {
		--action-btn-width: 84px;
		position: absolute;
		top: 0;
		right: 5px;
		bottom: 0;
		width: 300px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	/* lichess-style palette: borderless tiles, flush grid */
	.palette {
		display: flex;
		flex-direction: column;
	}
	.tool-row {
		display: flex;
	}
	/* bin/cursor tiles match the piece tiles' size (a sixth of the row) */
	.tool-row > .palette-piece {
		flex: 0 0 calc(100% / 6);
		width: auto;
		height: auto;
		aspect-ratio: 1;
	}
	.palette-row {
		display: flex;
	}
	.palette-row > .palette-piece {
		flex: 1 1 0;
		width: auto;
		height: auto;
		aspect-ratio: 1;
	}
	.palette-piece {
		width: 44px;
		height: 44px;
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: white;
		border: none;
		cursor: pointer;
		font-size: 1.3rem;
		padding: 2px;
	}
	.palette-piece:hover {
		background-color: gainsboro;
	}
	/* the bin and cursor tools render larger than the 1.3rem default; the
	   pieces size themselves via their own svg rule below */
	.palette-piece.trash,
	.tool-row .palette-piece {
		font-size: 1.7rem;
		color: #333;
	}
	/* selection reads through the background alone, same yellow as the
	   board's picked-up-piece highlight */
	.palette-piece.selected {
		background-color: #ffff33;
	}
	.palette-piece svg {
		width: 100%;
		height: 100%;
	}
	/* fills the panel's remaining height, pushing the buttons to the bottom */
	.move-list {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		min-height: 0;
		overflow-y: auto;
	}
	/* lichess-style rows: number gutter + two equal move columns filling the panel */
	.move-row {
		display: grid;
		grid-template-columns: 2.2em minmax(0, 1fr) minmax(0, 1fr);
		align-items: stretch;
	}
	.move-number {
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.6);
		background-color: rgba(0, 0, 0, 0.04);
		padding: 3px 0 3px 6px;
	}
	.move-btn {
		border: none;
		background-color: transparent;
		padding: 3px 8px;
		text-align: left;
		cursor: pointer;
	}
	.move-btn.ellipsis {
		cursor: default;
		color: rgba(0, 0, 0, 0.5);
	}
	button.move-btn:hover:enabled {
		background-color: gainsboro;
	}
	button.move-btn:disabled {
		color: rgba(0, 0, 0, 0.35);
		cursor: default;
	}
	/* the front/back boundary in the always-complete move list */
	.back-divider {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 2px 0;
	}
	.back-divider::before,
	.back-divider::after {
		content: "";
		flex: 1;
		border-top: 1px solid rgba(0, 0, 0, 0.25);
	}
	.back-divider span {
		font-size: 0.8rem;
		color: rgba(0, 0, 0, 0.45);
	}
	.move-btn.current {
		background-color: var(--accent);
		color: white;
	}
	.position-buttons {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}
	.position-buttons > .std-btn {
		white-space: nowrap;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		/* pinned to the panel's bottom, below the palette / scrolling move list */
		margin-top: auto;
	}
	.actions .std-btn {
		width: var(--action-btn-width);
	}
</style>
