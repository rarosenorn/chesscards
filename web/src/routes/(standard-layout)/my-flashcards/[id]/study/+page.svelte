<script>
	import { getContext } from "svelte"
	import { enhance } from "$app/forms"
	import { fsrs, Rating } from "ts-fsrs"
	import { ttGenerateHTML } from "$lib/tiptap-utility.js"
	import { countBoards, boardsBefore } from "$lib/card-utils.js"
	import Chessboard from "$lib/components/Chessboard.svelte"
	import PartyPopper from "$lib/icons/PartyPopper.svelte"
	import { updateCardStudyStateAndAddLog } from "./study.remote.js"

	let deck = getContext("deck");

	const scheduler = fsrs();

	let isCardTurned = $state(false);

	let currentCard = $derived(deck.cards.find(card =>
		!card.finished_at && Date.parse(card.due) <= Date.now()
	));

	let isTactic = $derived(currentCard?.card_type === "tactic");

	let preview = $derived(isTactic ? null : scheduler.repeat(currentCard, new Date()));

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
		if (!isCardTurned) {
			if (e.key === " ") {
				e.preventDefault();
				isCardTurned = true;
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

{#snippet side(side, boardNumberOffset, revealed)}
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
						{#if showBoardNumbers}
							<p class="board-number">
								{boardNumberOffset + boardsBefore(side, blockIndex) + boardIndex + 1}
							</p>
						{/if}
						<Chessboard board={chessboard} {revealed} minWidth="409px" />
					</div>
				{/each}
			</div>
		{/if}
	{/each}
{/snippet}

{#if currentCard}
	<div class="flashcard card-surface">
		<!-- turning reveals front boards' back layers (moves/annotations) in
		     place, on top of showing the back side below -->
		{@render side(currentCard.front, 0, isCardTurned)}
		{#if isCardTurned}
			{@render side(currentCard.back, frontBoardCount, true)}
		{/if}
		{#if isCardTurned}
			<button
				class="std-btn hide-answer-btn"
				onclick={() => isCardTurned = false}
				title="Shortcut key: h"
			>
				Hide answer
			</button>
		{/if}
		<div class="flashcard-btn-row">
			{#if !isCardTurned}
				<button 
					class="std-btn"
					onclick={() => isCardTurned = true}
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
	/* fits two lines of text plus one board row with a little slack; the
	   taller bottom padding keeps content clear of the button row */
	.flashcard {
		align-items: center;
		margin-top: 34px;
		min-height: 700px;
		padding: 36px 30px 90px 30px;
		position: relative;
	}
	.text-block {
		padding: 0 30px;
	}
	/* boards breathe: extra space between board blocks and neighboring text */
	.single-board-block {
		display: flex;
		position: relative;
		flex-direction: column;
		align-items: center;
		margin: 26px 0;
	}
	/* a lone board keeps the same size as a 2-column grid cell, centered */
	.single-board-block > .board-container {
		width: calc(50% - 10px);
		/* a board wider than the half-width cell (Chessboard minWidth) must
		   grow the centered cell, not spill out one-sided */
		min-width: min-content;
	}
	.board-grid-block {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 20px;
		position: relative;
		margin: 26px 0;
	}
	/* quiet exit bottom-left, away from the rating row */
	.hide-answer-btn {
		position: absolute;
		bottom: 10px;
		left: 30px;
		padding: 4px 8px;
	}
	.flashcard-btn-row {
		display: flex;
		flex-direction: row;
		justify-content: center;
		gap: 20px;
		position: absolute;
		bottom: 10px;
	}
	.flashcard-btn-row p {
		text-align: center;
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
