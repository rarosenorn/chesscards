<script>
	import { getContext } from "svelte"
	import { enhance } from "$app/forms"
	import { fsrs, Rating } from "ts-fsrs"
	import { boardAlignment, boardsAllAlone } from "$lib/side-alignment.js"
	import { ttGenerateHTML } from "$lib/tiptap-utility.js"
	import { countBoards, boardsBefore, firstBoardWithMoves, sideHasContent } from "$lib/card-utils.js"
	import { isSeen, unlockedStageIds, stageProgress, stageLabel } from "$lib/stages.js"
	import Chessboard from "$lib/components/Chessboard.svelte"
	import PartyPopper from "$lib/icons/PartyPopper.svelte"
	import { confirmModal } from "$lib/modals.svelte.js"
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

	let currentCard = $derived.by(() => {
		const due = deck.cards.filter(card =>
			!card.finished_at && Date.parse(card.due) <= Date.now() && !gated(card)
		);
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

	const handleKeyDown = e => {
		// while editing, the card editor owns the keyboard (Ctrl+Enter saves)
		if (editingCard) return;
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
<svelte:window onkeydown={handleKeyDown} />

{#snippet side(side, boardNumberOffset, revealed, marksBack = false)}
<div
	class="card-side"
	data-board-align={boardAlignment(side)}
>
	{#each side as block, blockIndex}
		{#if block.type === "text"}
			<div class="text-block">
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
						number={showBoardNumbers ? boardNumberOffset + boardsBefore(side, blockIndex) + boardIndex + 1 : null}
						autoFocus={boardNumberOffset + boardsBefore(side, blockIndex) + boardIndex === focusBoardNumber}
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
		<div class="flashcard-btn-row">
			{#if !isCardTurned}
				<button
					class="std-btn"
					onclick={showAnswer}
					title="Shortcut key: Space"
				>
					Show
				</button>
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
	<div class="deck-done">
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


<style>
	/* The card grows past its floor by whatever it holds: the question alone
	   at first, then the answer when that shows. The floor is browse's card
	   floor plus what the controls add here — 24px of air, the 59px row, and
	   14px less rim below them (10px, not 24) — so a card holding the usual
	   text/board/answer neither resizes on reveal nor strands the buttons
	   mid-card. Board/text layout inside the card comes from app.css ("card
	   board layout"), shared with browse */
	.flashcard {
		align-items: center;
		margin-top: 24px;
		min-height: calc(var(--flashcard-min-height) + 69px);
		/* the top is the card's rim, wider than the divider's 18px between
		   the sides; the row below closes the card at the 10px it has always
		   kept from the bottom edge */
		padding: 24px 37px 10px 37px;
	}
	/* The controls close the card, one centred row on one 20px rhythm. The
	   auto margin drops the row to the card's floor — on a card shorter than
	   the minimum height the slack belongs above the buttons, not below them
	   — and the padding holds their distance from the content once the card
	   is full. Bottom-aligned, since the due-time labels sit above the
	   rating buttons. */
	.card-actions {
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
	.deck-done {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		margin-top: 28vh;
	}
	.next-review {
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.6);
	}
</style>
