<script>
	import { getContext, onMount } from "svelte"
	import { enhance } from "$app/forms"
	import { fsrs, Rating } from "ts-fsrs"
	import { boardAlignment, boardsAllAlone } from "$lib/side-alignment.js"
	import { ttGenerateHTML } from "$lib/tiptap-utility.js"
	import { countBoards, boardsBefore, firstBoardWithMoves, sideHasContent } from "$lib/card-utils.js"
	import { isSeen, unlockedStageIds, stageProgress, stageLabel } from "$lib/stages.js"
	import Chessboard from "$lib/components/Chessboard.svelte"
	import { parseMoveRef, markMoveRefs } from "$lib/tiptap-move-ref.js"
	import PartyPopper from "$lib/icons/PartyPopper.svelte"
	import { confirmModal, modalState } from "$lib/modals.svelte.js"
	import { zen, zenActive, loadZen, setZen } from "$lib/zen-state.svelte.js"
	import { updateCardStudyStateAndAddLog } from "./study.remote.js"
	import { updateCardContent, updateCardType, deleteCards } from "../browse/browse.remote.js"

	let deck = getContext("deck");
	// marketplace deck instances can only be viewed, not edited
	const readonly = deck.isMarketplace;

	// owners can edit the current card in place (like browse), via the Edit
	// button on the answer row or the e key
	let editingCard = $state(false);

	// The block editor drags tiptap's ProseMirror view, the chessboard editor
	// and svelte-dnd-action behind it — ~1.2 MB that studying never touches.
	// Loading it on the first edit keeps it off the path to the first card.
	let CardBlockEdit = $state(null);
	let editorModule = null;

	// The card's type is chosen on the row above the editor, as on the
	// add-cards page. It is held here rather than written on click: the
	// editor has a Cancel, and a type already saved would survive it.
	let editCardType = $state(null);

	const startEditing = async () => {
		editorModule ??= import("$lib/components/CardBlockEdit.svelte");
		CardBlockEdit = (await editorModule).default;
		editCardType = currentCard.card_type;
		editingCard = true;
	}
	const saveEdit = async (front, back) => {
		const card = currentCard;
		await updateCardContent({ cardId: card.id, front, back });
		card.front = JSON.parse(front);
		card.back = JSON.parse(back);
		// the type is saved with the rest, so cancelling leaves it alone. It
		// decides how the card is graded, so the queue re-derives from it.
		if (editCardType !== card.card_type) {
			Object.assign(card, await updateCardType({ cardId: card.id, cardType: editCardType }));
		}
		editingCard = false;
	}

	// the Delete key drops the card being studied, behind browse's confirmation
	// — the card and its review history go for good. Removing it from
	// deck.cards re-derives currentCard, so the next due card takes its place.
	const deleteCurrentCard = async () => {
		const { id } = currentCard;
		const confirmed = await confirmModal({
			title: "Delete card",
			message: "This permanently deletes the card and its review history.",
			confirmLabel: "Delete",
			danger: true
		});
		if (!confirmed) return;
		await deleteCards({ cardIds: [id] });
		deck.cards = deck.cards.filter(card => card.id !== id);
		isCardTurned = false;
	}

	const scheduler = fsrs();

	// --- the queue ---
	// Due reviews come first, shuffled once per visit (the keys live for the
	// component, so grading doesn't reshuffle what's left); new and learning
	// cards follow in the deck's stage/card order — a failed card's earlier
	// position brings it back before the news that come after it. A tactic
	// has no FSRS state: unseen it queues as new, seen-but-unfinished it
	// queues with the reviews.
	const shuffleKeys = new Map();
	const shuffleKey = id => {
		if (!shuffleKeys.has(id)) shuffleKeys.set(id, Math.random());
		return shuffleKeys.get(id);
	}
	const isReviewState = card => card.card_type === "tactic"
		? isSeen(card)
		: card.state === 2 || card.state === 3;

	let stagePositions = $derived(new Map(deck.stages.map(stage => [stage.id, stage.position])));
	const byDeckOrder = (a, b) =>
		stagePositions.get(a.stage_id) - stagePositions.get(b.stage_id) || a.position - b.position;

	// Progression gates only the introduction of unseen cards: anything
	// already met keeps its reviews coming even if its stage has fallen
	// back behind the bar (cards moved, stages regrouped). A deck with
	// chapters switched off shows none of them, so it gates nothing either —
	// its stages may still be there, but nothing tells the studier so.
	let progression = $derived(deck.chapters && deck.stageProgression);
	let unlockedStages = $derived(unlockedStageIds(deck.stages, deck.cards));
	const gated = card =>
		progression && !isSeen(card) && !unlockedStages.has(card.stage_id);

	// The clock the queue is measured against. It ticks only while nothing is
	// on screen (see below), so a card that comes due mid-review can never
	// replace the one being looked at.
	let now = $state(Date.now());
	const isDue = card =>
		!card.finished_at && Date.parse(card.due) <= now && !gated(card);

	// Anki's three counts, on the same split the deck list uses (decks.js):
	// a card is new while it has never been graded, learning while it is
	// stepping through the short intervals, due once it is on a real
	// schedule. Gated and finished cards are not waiting, so they are not
	// counted.
	const queueOf = card =>
		card.state === 1 || card.state === 3 ? "learn"
			: card.state === 0 || (card.state == null && (card.reps ?? 0) === 0) ? "new"
			: "review";
	let counts = $derived.by(() => {
		const due = deck.cards.filter(isDue);
		return {
			new: due.filter(card => queueOf(card) === "new").length,
			learn: due.filter(card => queueOf(card) === "learn").length,
			review: due.filter(card => queueOf(card) === "review").length
		};
	});

	let currentCard = $derived.by(() => {
		const due = deck.cards.filter(isDue);
		const reviews = due.filter(isReviewState);
		if (reviews.length) {
			return reviews.reduce((min, card) => shuffleKey(card.id) < shuffleKey(min.id) ? card : min);
		}
		return due.sort(byDeckOrder)[0];
	});

	// A revealed answer belongs to the deck layout, not to this page, so
	// switching tabs and coming back does not hide it again — you have seen
	// it, and the grade should say so. Read once for the initial value, then
	// mirrored back on every change; the id keeps it from carrying over to
	// whichever card comes next.
	const studyState = getContext("studyState");
	// svelte-ignore state_referenced_locally
	let isCardTurned = $state(currentCard != null && studyState.turnedCardId === currentCard.id);
	$effect(() => { studyState.turnedCardId = isCardTurned ? currentCard?.id ?? null : null; });

	let isTactic = $derived(currentCard?.card_type === "tactic");
	// which of the three the card on screen came out of
	let currentQueue = $derived(currentCard ? queueOf(currentCard) : null);

	// The clock the due-time previews are measured from. It has to be taken
	// when the answer is revealed, not when this component runs: `new Date()`
	// is a plain value, so a page left open for a quarter of an hour would
	// otherwise offer "1 minute from fifteen minutes ago" — a negative label
	// under Again. The previews are only on screen while turned, so revealing
	// is the one moment that needs a fresh reading.
	let previewAt = $state(Date.now());
	const showAnswer = () => {
		previewAt = Date.now();
		isCardTurned = true;
	}

	let preview = $derived(isTactic ? null : scheduler.repeat(currentCard, new Date(previewAt)));

	let frontBoardCount = $derived(currentCard ? countBoards(currentCard.front) : 0);
	// where the arrows land: the card's first board that has moves to step
	let focusBoardNumber = $derived(
		currentCard ? firstBoardWithMoves(currentCard.front, currentCard.back) : null
	);
	// board numbers are only shown when the card has several boards to reference
	let showBoardNumbers = $derived(
		currentCard && frontBoardCount + countBoards(currentCard.back) > 1
	);

	// A move written in the card's text drives the board it names (see
	// tiptap-move-ref.js): the click is handed to that board by number, and
	// the nonce makes a second click on the same move a second request. One
	// store for the whole card, front and back alike; the next card starts
	// with nothing followed.
	let asides = $state({});
	let clicks = 0;
	$effect(() => { void currentCard; asides = {} });
	// ...and each board answers with where it now stands, so the move it is
	// showing is marked in the text that named it — an aside is nowhere else
	let boardAt = $state({});
	let cardElement = $state();
	$effect(() => { void currentCard; void isCardTurned; markMoveRefs(cardElement, boardAt) });
	const handleTextClick = e => {
		const token = e.target.closest?.("[data-move-ref]");
		if (!token) return;
		const ref = parseMoveRef(token);
		if (ref) asides[ref.board] = { ...ref, nonce: ++clicks };
	}

	const evaluateCard = async rating => {
		const cardAndLog =
			scheduler.next(currentCard, new Date(), rating);
		isCardTurned = false;
		deck.cards[deck.cards.indexOf(currentCard)] = cardAndLog.card;
		await updateCardStudyStateAndAddLog(cardAndLog);
	}

	// tactic cards: Correct finishes the card for good, Incorrect re-queues
	// it a day later (a post-fail success can't come from short-term memory)
	const evaluateTactic = async correct => {
		const now = new Date();
		const card = {
			...currentCard,
			due: correct ? currentCard.due : new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
			finished_at: correct ? now.toISOString() : null,
			// the tactic's "seen" mark: with no FSRS state, last_review is what
			// tells an attempted card from an untouched one (stage progression
			// reads it)
			last_review: now.toISOString()
		};
		const log = {
			rating: correct ? Rating.Good : Rating.Again,
			state: null, due: correct ? null : card.due, stability: null,
			difficulty: null, elapsed_days: null, last_elapsed_days: null,
			scheduled_days: null, learning_steps: null, review: now.toISOString()
		};
		isCardTurned = false;
		deck.cards[deck.cards.indexOf(currentCard)] = card;
		await updateCardStudyStateAndAddLog({ card, log });
	}

	// `from` is the clock the interval is measured against. The grade previews
	// pass previewAt — the instant they were computed from — so "1m" under
	// Again stays 1m however long the answer sits on screen; measuring them
	// against the current time counts that reading time down and goes
	// negative. Grading itself starts a fresh clock, so previewAt is also the
	// promise it keeps.
	const formatTimeUntil = (dueDate, from = Date.now()) => {
		const minutes = (Date.parse(dueDate) - from) / 1000 / 60;
		if (minutes < 60)
			return Math.round(minutes * 10) / 10 + "m";
		if (minutes / 60 < 24)
			return Math.round(minutes / 60 * 10) / 10 + "h";
		if (minutes / 60 / 24 < 365) {
			return Math.floor(minutes / 60 / 24) + "d";
		}
		return minutes / 60 / 24 / 365 + "y";
	}

	const getTimeUntilDuePreviewText = rating =>
		formatTimeUntil(preview[rating].card.due, previewAt);

	// same thresholds as formatTimeUntil, spelled out ("3.5 hours")
	const formatTimeUntilLong = dueDate => {
		const withUnit = (value, unit) => `${value} ${unit}${value === 1 ? "" : "s"}`;
		const minutes = (Date.parse(dueDate) - Date.now()) / 1000 / 60;
		if (minutes < 1)
			return "less than a minute";
		if (minutes < 60)
			return withUnit(Math.round(minutes), "minute");
		if (minutes / 60 < 24)
			return withUnit(Math.round(minutes / 60 * 10) / 10, "hour");
		if (minutes / 60 / 24 < 365)
			return withUnit(Math.floor(minutes / 60 / 24), "day");
		return withUnit(Math.round(minutes / 60 / 24 / 365 * 10) / 10, "year");
	}

	// earliest upcoming due among the deck's unfinished, ungated cards (null
	// when empty or all finished); only meaningful when no card is currently
	// due — a locked stage's cards have no date to promise, its unlock note
	// below speaks for them
	let nextDue = $derived.by(() => {
		const unfinished = deck.cards.filter(card => !card.finished_at && !gated(card));
		return unfinished.length
			? unfinished.reduce((min, card) =>
				Date.parse(card.due) < Date.parse(min.due) ? card : min
			).due
			: null;
	});

	// when the queue runs dry against a locked stage, say what unlocks it:
	// the first locked stage and how far the one before it has to go
	let lockedNote = $derived.by(() => {
		if (!progression) return null;
		const sorted = [...deck.stages].sort((a, b) => a.position - b.position);
		const index = sorted.findIndex(stage => !unlockedStages.has(stage.id));
		if (index < 1) return null;
		const locked = sorted[index];
		const before = sorted[index - 1];
		const progress = stageProgress(deck.cards.filter(card => card.stage_id === before.id));
		return {
			locked: stageLabel(locked),
			before: stageLabel(before),
			progress
		};
	});

	// Zen mode: the page's two bars step aside while a card is up (the store
	// carries it to the layouts that own them; the counters and Edit stay).
	// It is the study page that holds the mode — mounted here, dropped on the
	// way out — so the preference outlives the visit without following the
	// user into Cards or the deck list.
	onMount(() => {
		loadZen();
		return () => { zen.studying = false; zen.peeking = false };
	});
	// On the "finished for now" screen the next card is often minutes away (the
	// learning steps are 1m and 10m), so the clock ticks there and the card
	// arrives on its own. It stops the moment one does — a queue that
	// re-derives under a card being studied would swap it out mid-thought.
	$effect(() => {
		if (currentCard) return;
		const id = setInterval(() => now = Date.now(), 30_000);
		return () => clearInterval(id);
	});

	// zen holds only while a card is up: the deck's "finished for now" screen
	// is the end of the session, and the page's chrome belongs back on it.
	// The preference itself stays on, so the next card enters zen again.
	$effect(() => {
		zen.studying = currentCard != null;
		if (!currentCard) zen.peeking = false;
	});

	// The bars come back while the pointer is at the top of the window, which
	// is what keeps a chromeless page from being a trap. Two thresholds, not
	// one: they slide in at the very edge but only leave once the pointer is
	// clear of where they now sit, or a bar would vanish from under a cursor
	// on its way to a tab.
	const PEEK_IN = 40;
	const PEEK_OUT = 150;
	const handleMouseMove = e => {
		if (!zenActive()) return;
		if (e.clientY <= PEEK_IN) zen.peeking = true;
		else if (e.clientY > PEEK_OUT) zen.peeking = false;
	}

	const handleKeyDown = e => {
		// while editing, the card editor owns the keyboard (Ctrl+Enter saves)
		if (editingCard) return;
		const typing = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA"
			|| e.target.isContentEditable;
		if (e.key === "z" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing) {
			e.preventDefault();
			setZen(!zen.on);
			return;
		}
		// Escape always leaves, whatever put you here — unless a modal is up,
		// where Escape is the modal's cancel and nothing else's
		if (e.key === "Escape" && zen.on && !modalState.current) {
			e.preventDefault();
			setZen(false);
			return;
		}
		if (
			e.key === "e" && !e.ctrlKey && !e.metaKey && !e.altKey &&
			!readonly && currentCard &&
			e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA" &&
			!e.target.isContentEditable
		) {
			e.preventDefault();
			startEditing();
			return;
		}
		if (
			e.key === "Delete" && !readonly && currentCard &&
			e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA" &&
			!e.target.isContentEditable
		) {
			e.preventDefault();
			deleteCurrentCard();
			return;
		}
		if (!isCardTurned) {
			if (e.key === " ") {
				e.preventDefault();
				showAnswer();
			}
		} else if (e.key === "h" || e.key === "H") {
			isCardTurned = false;
		} else if (isTactic) {
			switch (e.key) {
				case "1": evaluateTactic(false); break;
				case " ":
				case "2":
					e.preventDefault();
					evaluateTactic(true);
					break;
			}
		} else {
			switch (e.key) {
				case "1": evaluateCard(Rating.Again); break;
				case "2": evaluateCard(Rating.Hard); break;
				case " ":
				case "3":
					e.preventDefault();
					evaluateCard(Rating.Good);
					break;
				case "4": evaluateCard(Rating.Easy); break;
			}
		}
	}

</script>
<svelte:window onkeydown={handleKeyDown} onmousemove={handleMouseMove} />

{#snippet side(side, boardNumberOffset, revealed, marksBack = false)}
<div
	class="card-side"
	data-board-align={boardAlignment(side)}
>
	{#each side as block, blockIndex}
		{#if block.type === "text"}
			<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -- the moves inside are pointer targets; the board's own move line is the keyboard's way through a line -->
			<div class="text-block" onclick={handleTextClick}>
				{@html ttGenerateHTML(block.content)}
			</div>
		{:else if block.type === "chessboards"}
			<div
				class={{
					"single-board-block": block.content.length < 2,
						"board-grid-block": block.content.length > 1
				}}
			>
				{#each block.content as chessboard, boardIndex}
					<!-- the board's number is what the text calls it by, whether
					     or not the card is showing numbers -->
					{@const n = boardNumberOffset + boardsBefore(side, blockIndex) + boardIndex + 1}
					<div class="board-container">
						<!-- low floor: two squeezed boards must shrink, not overflow
					     their cells and crush the gap between them -->
					<!-- the "Back:" marker rides on the reveal: it names the moves
					     the question was hiding, so before the reveal there is
					     nothing to name (and it would spell out the answer);
					     back-side boards hide nothing, so they never mark, as
					     in browse -->
					<Chessboard
						board={chessboard}
						{revealed}
						authorView={marksBack}
						minWidth="280px"
						number={showBoardNumbers ? n : null}
						autoFocus={n - 1 === focusBoardNumber}
						aside={asides[n]}
						onPosition={at => boardAt[n] = at}
					/>
					</div>
				{/each}
			</div>
		{/if}
	{/each}
</div>
{/snippet}

{#if currentCard && editingCard && CardBlockEdit}
	<!-- the add-cards type row, above the card and on the page's own ground -->
	<div class="edit-type-row">
		<span id="edit-card-type-label">Type</span>
		<div class="type-segments" role="radiogroup" aria-labelledby="edit-card-type-label">
			{#each [["basic", "Basic"], ["tactic", "Tactic"]] as [value, label]}
				<button
					class="std-btn"
					role="radio"
					aria-checked={editCardType === value}
					class:selected={editCardType === value}
					onclick={() => editCardType = value}
				>
					{label}
				</button>
			{/each}
		</div>
	</div>
	<div class="flashcard-edit card-surface">
		<CardBlockEdit card={currentCard} onSave={saveEdit} onCancel={() => editingCard = false} />
	</div>
{:else if currentCard}
	<div
		class="flashcard card-surface"
		class:zen={zenActive()}
		bind:this={cardElement}
		data-boards={boardsAllAlone(currentCard) ? "solo" : null}
	>
		<!-- turning reveals front boards' back layers (moves/annotations) in
		     place, on top of showing the back side below -->
		{@render side(currentCard.front, 0, isCardTurned, isCardTurned)}
		{#if isCardTurned}
			{#if sideHasContent(currentCard.back)}
				<div class="side-gap"></div>
			{/if}
			{@render side(currentCard.back, frontBoardCount, true)}
		{/if}
		<div class="card-actions">
		<!-- Anki's counts, in Anki's colours: what is still waiting in this
		     deck, kept out of the centred button row's way -->
		<!-- Written without whitespace between the spans: a newline here is a
		     space in the rendered line, and the gap is the plus's own margin.
		     The hair spaces inside each count are what widen its underline —
		     chrome draws the rule across the text, so padding cannot. -->
		<p class="deck-counts"><span class="count new" class:current={currentQueue === "new"}><span class="hair">{"\u200a"}</span>{counts.new}<span class="hair">{"\u200a"}</span></span><span class="plus">+</span><span class="count learn" class:current={currentQueue === "learn"}><span class="hair">{"\u200a"}</span>{counts.learn}<span class="hair">{"\u200a"}</span></span><span class="plus">+</span><span class="count review" class:current={currentQueue === "review"}><span class="hair">{"\u200a"}</span>{counts.review}<span class="hair">{"\u200a"}</span></span></p>
		<div class="flashcard-btn-row">
			{#if !isCardTurned}
				<!-- carried in the same shape as a grade button, label and all,
				     so the row is the height it will be after the reveal: the
				     card must not resize under the pointer when the answer
				     comes in. The label is a spacer, hence aria-hidden. -->
				<div class="eval-btn">
					<p aria-hidden="true">&nbsp;</p>
					<button
						class="std-btn"
						onclick={showAnswer}
						title="Shortcut key: Space"
					>
						Show
					</button>
				</div>
			{:else}
					{#snippet evalBtn(text, rating, title)}
						<div class="eval-btn">
							<p>{getTimeUntilDuePreviewText(rating)}</p>
							<button
								onclick={() => evaluateCard(rating)}
								class="std-btn"
								title={"Shortcut key: " + title}
							>
								{text}
							</button>
						</div>
					{/snippet}
					{#if isTactic}
						<div class="eval-btn">
							<p>1d</p>
							<button
								onclick={() => evaluateTactic(false)}
								class="std-btn"
								title="Shortcut key: 1"
							>
								Incorrect
							</button>
						</div>
						<div class="eval-btn">
							<button
								onclick={() => evaluateTactic(true)}
								class="std-btn"
								title="Shortcut key: Space or 2"
							>
								Correct
							</button>
						</div>
					{:else}
						{@render evalBtn("Again", Rating.Again, "1")}
						{@render evalBtn("Hard", Rating.Hard, "2")}
						{@render evalBtn("Good", Rating.Good, "Space or 3")}
						{@render evalBtn("Easy", Rating.Easy, "4")}
					{/if}
			{/if}
		</div>
		{#if isCardTurned}
			<div class="side-actions">
				<button
					class="std-btn"
					onclick={() => isCardTurned = false}
					title="Shortcut key: h"
				>
					Hide
				</button>
				{#if !readonly}
					<button
						class="std-btn"
						onclick={startEditing}
						title="Shortcut key: e"
					>
						Edit
					</button>
				{/if}
			</div>
		{/if}
		</div>
	</div>
{:else}
	<div class="deck-done" class:zen={zenActive()}>
		{#if lockedNote}
			<p>All caught up here for now.</p>
			<p class="next-review">
				{lockedNote.locked} unlocks when {lockedNote.before} passes:
				{lockedNote.progress.seen} of {lockedNote.progress.total} seen,
				{lockedNote.progress.graduated} of {lockedNote.progress.graduatedNeeded} graduated.
			</p>
		{:else}
			<p>Congratulations you finished this deck for now! <span class="party"><PartyPopper /></span></p>
		{/if}
		{#if nextDue}
			<p class="next-review">Next review in {formatTimeUntilLong(nextDue)}</p>
		{/if}
	</div>
{/if}

<!-- The way in, for a pointer: zen's own key is z, but a mode with no button
     is a mode nobody finds. It shows only while the chrome does, and once zen
     is on the top-edge peek and Escape are the ways back. -->
{#if !zen.on}
	<button
		class="zen-btn"
		title="Shortcut key: z"
		onclick={() => setZen(true)}
	>Zen mode</button>
{/if}

<style>
	/* bottom left of the window, out of the card's way: it belongs to the page
	   rather than to the card, and the card is centred */
	.zen-btn {
		position: fixed;
		left: 16px;
		bottom: 16px;
		z-index: 30;
		border: 1px solid lightgrey;
		border-bottom: 1px solid darkgrey;
		background-color: #f5f5f5;
		border-radius: 4px;
		padding: 5px 12px;
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.55);
		cursor: pointer;
		transition: color 110ms ease, background-color 110ms ease;
	}
	.zen-btn:hover {
		color: black;
		background-color: #f8f8f8;
	}
	.zen-btn:active {
		transform: translateY(1px);
	}
	/* The floor is the card the question will become: its board, its own
	   furniture and the room held for the answer (--card-furniture, in
	   app.css, where the same figure sizes the board). A question is
	   therefore already the height it will keep, and the reveal fills room
	   rather than pushing the card down the window. Layout inside the card
	   comes from app.css ("card board layout"), shared with browse. */
	/* zen: with the bars gone the card would sit against the window's edge, so
	   it takes twice its usual air above. The mode keeps it through a peek —
	   the bars sliding in is movement enough without the card shifting too */
	/* The one thing that differs by mode is how much air the card takes above
	   it; the chrome above that comes from the layout. Both feed the board's
	   height budget below, so the three modes can't drift apart. */
	/* zen centres the card (app.css), and the card's own margin is what makes
	   the top gap larger than the bottom one — so this is the bias itself,
	   not the air: a little high of centre, in every window. */
	.flashcard.zen {
		/* no margin of its own: a window the card nearly fills should centre it
		   evenly, and the bias below is the only thing that moves it down */
		--card-margin: 0px;
		--page-bottom: 0px;
		/* The air the card may never eat into: it is taken out of the board's
		   height budget, so a short window shrinks the board rather than
		   pushing the card against the screen. Wider than the page's own 30px
		   — with no bars around it, the card is the only thing the window has
		   to frame — and wider again in fullscreen below, where the window's
		   own edges are gone too. */
		--zen-air-top: 40px;
		--zen-air-bottom: 35px;
		--zen-frame: calc(var(--zen-air-top) + var(--zen-air-bottom));
		/* Where the card hangs: a little over half the room left over by the
		   whole card, answer included — the air reads better above the card
		   than below it. Measured against the question instead, the lift
		   counted the answer's room as spare and spent nearly half of it
		   above the card, pushing the top gap down the window and the answer
		   against its bottom edge. The card still hangs from a fixed top, so
		   an answer longer than the room held for it grows downwards rather
		   than lifting the board. */
		--zen-room: calc(100dvh - var(--solo-board-size) - var(--card-furniture));
		/* On a window the board's height governs, the room left over IS the
		   frame, so the max() hands the top its share as asked. The ratio
		   only takes over on a window tall enough that the board stops at its
		   width instead: the leftover is larger than the frame there, and the
		   card centres in it, a little high. */
		--zen-lift: max(var(--zen-air-top), calc(var(--zen-room) * 0.53));
		/* The bias is a luxury: on a window that the card nearly fills, an
		   uneven split is just a lopsided card, so it stays at zero until
		   there is room to spare and then takes a fifth of it, up to 20px.
		   It rides on top of --card-margin rather than in it, so the board's
		   height budget (which reads --card-margin) sees a constant. */
		--zen-bias: clamp(0px, (var(--zen-room) - 160px) * 0.2, 20px);
	}
	/* fullscreen: no window chrome either, so the card can afford more air
	   still. The board gives the difference back, as it does for the rest of
	   the frame. */
	@media all and (display-mode: fullscreen) {
		.flashcard.zen {
			--zen-air-top: 60px;
			--zen-air-bottom: 55px;
		}
	}
	.flashcard {
		align-items: center;
		--card-margin: 24px;
		/* the air under a revealed card, matching the 30px zen keeps at each
		   end of its frame — the furniture holds none of its own, so this is
		   the whole of it */
		--page-bottom: 30px;
		margin-top: calc(var(--card-margin) + var(--zen-bias, 0px) + var(--zen-lift, 0px));
		--board-height-budget: calc(
			var(--study-chrome, 110px) + var(--card-margin) + var(--card-furniture)
				+ var(--page-bottom, 24px) + var(--zen-frame, 0px)
		);
		/* The card stands at the height it was budgeted for: its board and the
		   whole furniture, the answer's room included. A question therefore
		   opens at the size it will keep, and the reveal fills room the card
		   was already holding instead of growing into the page. */
		min-height: calc(var(--solo-board-size) + var(--card-furniture));
		/* the top is the card's rim, wider than the divider's 18px between
		   the sides; the row below closes the card at the 10px it has always
		   kept from the bottom edge */
		padding: 32px 37px 10px 37px;
	}
	/* The controls close the card, one centred row on one 20px rhythm. The
	   auto margin drops the row to the card's floor — on a card shorter than
	   the minimum height the slack belongs above the buttons, not below them
	   — and the padding holds their distance from the content once the card
	   is full. Bottom-aligned, since the due-time labels sit above the
	   rating buttons. */
	/* the counts hang in the row's bottom-right corner without displacing the
	   buttons, which stay centred on the card */
	.deck-counts {
		position: absolute;
		right: 0;
		/* the button's own padding and border, so the numbers sit on the same
		   line as the words in the row rather than on the row's box edge */
		bottom: 5px;
		/* not a flex row: a flex item is blockified, and an underline only
		   runs under an INLINE box's padding — which is what widens the rule
		   under the current count past its digit */
		white-space: nowrap;
		font-size: 0.9rem;
		font-weight: 500;
	}
	/* anki's deck browser colours: blue for new, rust for what is being
	   learned, green for the reviews coming round. A zero keeps its colour
	   here — the three are read as one running total, and a grey gap in the
	   middle of it breaks the line up */
	.deck-counts .new {
		color: #00a;
	}
	.deck-counts .learn {
		color: #c35617;
	}
	.deck-counts .review {
		color: #070;
	}
	/* the hair space that widens the underline, shrunk a touch further: the
	   space scales with its own font size, so this is the fine adjustment */
	.deck-counts .hair {
		font-size: 0.7em;
	}
	.deck-counts .plus {
		color: black;
		font-weight: 400;
		margin-inline: 1px;
	}
	/* which of the three the card on screen came from — underlined in its own
	   colour, as anki marks the queue it is drawing from */
	.deck-counts .current {
		text-decoration: underline;
		text-underline-offset: 1px;
	}
	.card-actions {
		position: relative;
		align-self: stretch;
		margin-top: auto;
		padding-top: 14px;
		display: flex;
		justify-content: center;
		align-items: flex-end;
		gap: 20px;
	}
	.side-actions {
		display: flex;
		gap: 20px;
	}
	.side-actions .std-btn {
		padding: 4px 8px;
	}
	/* the in-place card editor: same surface as the card it replaces, the
	   add-cards page's inner inset */
	/* sits on the grey above the card, the card's own width, as on the
	   add-cards page */
	.edit-type-row {
		width: 100%;
		max-width: var(--flashcard-width);
		margin: 24px auto 0 auto;
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
	.type-segments .std-btn {
		padding: 4px 10px;
		border-radius: 999px;
		color: rgba(0, 0, 0, 0.55);
	}
	.type-segments .std-btn.selected {
		background-color: white;
		border-color: darkgrey;
		color: #222;
		font-weight: 500;
	}
	.flashcard-edit {
		margin-top: 6px;
		padding: 12px 20px;
		/* the add-cards canvas: content lands at 896, so boards render the
		   card's exact sizes (432 cells, 562 lone) with text sharing both
		   edges — and the editor is exactly as wide as the card it replaces */
		max-width: var(--flashcard-width);
	}
	.flashcard-btn-row {
		display: flex;
		flex-direction: row;
		justify-content: center;
		align-items: flex-end;
		gap: 20px;
	}
	.flashcard-btn-row p {
		text-align: center;
		margin-bottom: 3px;
		font-size: 0.9rem;
		font-weight: 350;
	}
	.std-btn {
		padding: 4px 8px;
	}
	/* svg instead of an emoji: no color-emoji font on the user's system
	   required (Chromium on linux often has none) */
	.party {
		display: inline-block;
		vertical-align: -0.15em;
		font-size: 1.1em;
	}
	.party :global(svg) {
		display: block;
	}
	/* The panel sits 28% down the space it has to sit in. In zen that space
	   is the whole window rather than what the two bars leave, so the same
	   share is further down the page by 28% of the bars' ~110px — without it
	   the message rides visibly higher in zen than out of it. Fullscreen needs
	   nothing of its own: the dvh it is measured in already grew. */
	.deck-done {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		margin-top: 28dvh;
	}
	.deck-done.zen {
		margin-top: calc(28dvh + 30px);
	}
	.next-review {
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.6);
	}
</style>
