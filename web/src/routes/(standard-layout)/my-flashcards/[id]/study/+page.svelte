<script>
	import { getContext } from "svelte"
	import { enhance } from "$app/forms"
	import { fsrs, Rating } from "ts-fsrs"
	import { boardAlignment, boardsAllAlone } from "$lib/side-alignment.js"
	import { ttGenerateHTML } from "$lib/tiptap-utility.js"
	import { countBoards, boardsBefore, sideHasContent } from "$lib/card-utils.js"
	import Chessboard from "$lib/components/Chessboard.svelte"
	import CardBlockEdit from "$lib/components/CardBlockEdit.svelte"
	import PartyPopper from "$lib/icons/PartyPopper.svelte"
	import { confirmModal } from "$lib/modals.svelte.js"
	import { updateCardStudyStateAndAddLog } from "./study.remote.js"
	import { updateCardContent, deleteCards } from "../browse/browse.remote.js"

	let deck = getContext("deck");
	// marketplace deck instances can only be viewed, not edited
	const readonly = deck.isMarketplace;

	// owners can edit the current card in place (like browse), via the Edit
	// button on the answer row or the e key
	let editingCard = $state(false);
	const saveEdit = async (front, back) => {
		await updateCardContent({ cardId: currentCard.id, front, back });
		currentCard.front = JSON.parse(front);
		currentCard.back = JSON.parse(back);
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

	let currentCard = $derived(deck.cards.find(card =>
		!card.finished_at && Date.parse(card.due) <= Date.now()
	));

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
			finished_at: correct ? now.toISOString() : null
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

	const formatTimeUntil = dueDate => {
		const minutes = (Date.parse(dueDate) - Date.now()) / 1000 / 60;
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
		formatTimeUntil(preview[rating].card.due);

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

	// earliest upcoming due among the deck's unfinished cards (null when
	// empty or all finished); only meaningful when no card is currently due
	let nextDue = $derived.by(() => {
		const unfinished = deck.cards.filter(card => !card.finished_at);
		return unfinished.length
			? unfinished.reduce((min, card) =>
				Date.parse(card.due) < Date.parse(min.due) ? card : min
			).due
			: null;
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
			editingCard = true;
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
					/>
					</div>
				{/each}
			</div>
		{/if}
	{/each}
</div>
{/snippet}

{#if currentCard && editingCard}
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
							<p>Never</p>
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
						onclick={() => editingCard = true}
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
		<p>Congratulations you finished this deck for now! <span class="party"><PartyPopper /></span></p>
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
		margin-top: 34px;
		min-height: calc(var(--flashcard-min-height) + 69px);
		/* the top is the card's rim, wider than the divider's 18px between
		   the sides; the row below closes the card at the 10px it has always
		   kept from the bottom edge */
		padding: 24px 40px 10px 40px;
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
		padding-top: 24px;
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
	.flashcard-edit {
		margin-top: 34px;
		padding: 12px 30px;
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
