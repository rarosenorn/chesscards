<script>
	import { getContext } from "svelte"
	import { enhance } from "$app/forms"
	import { fsrs, Rating } from "ts-fsrs"
	import { ttGenerateHTML } from "$lib/tiptap-utility.js"
	import Chessboard from "$lib/components/Chessboard.svelte"
	import { updateCardStudyStateAndAddLog } from "./study.remote.js"

	let deck = getContext("deck");

	const scheduler = fsrs();

	let isCardTurned = $state(false);

	let currentCard = $derived(deck.cards.find(card => 
		Date.parse(card.due) <= Date.now()
	));

	let preview = $derived(scheduler.repeat(currentCard, new Date()));

	const evaluateCard = async rating => {
		const cardAndLog = 
			scheduler.next(currentCard, new Date(), rating);
		isCardTurned = false;
		deck.cards[deck.cards.indexOf(currentCard)] = cardAndLog.card;
		await updateCardStudyStateAndAddLog(cardAndLog);
	}

	const getTimeUntilDuePreviewText = rating => {
		const dueDateString = preview[rating].card.due;
		const minutes = (Date.parse(dueDateString) - Date.now()) / 1000 / 60;
		if (minutes < 60)
			return Math.round(minutes * 10) / 10 + "m";
		if (minutes / 60 < 24)
			return Math.round(minutes / 60 * 10) / 10 + "h";
		if (minutes / 60 / 24 < 365) {
			return Math.floor(minutes / 60 / 24) + "d";
		}
		return minutes / 60 / 24 / 365 + "y";
	}

	const handleKeyDown = e => {
		console.log(e);
		if (!isCardTurned) {
			if (e.key === " ") {
				e.preventDefault();
				isCardTurned = true;
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

{#snippet side(side)}
	{#each side as block}
		{#if block.type === "text"}
			{@html ttGenerateHTML(block.content)}
		{:else if block.type === "chessboards"}
			<div 
				class={{
					"single-board-block": block.content.length < 2,
						"board-grid-block": block.content.length > 1
				}}
			>
				{#each block.content as chessboard}
					<div class="board-container">
						<Chessboard fen={chessboard} />
					</div>
				{/each}
			</div>
		{/if}
	{/each}
{/snippet}

{#if currentCard}
	<div class="flashcard">
		{@render side(currentCard.front)}
		<hr class="divider">
		{#if isCardTurned}
			{@render side(currentCard.back)}
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
					{@render evalBtn("Again", Rating.Again, "1")}
					{@render evalBtn("Hard", Rating.Hard, "2")}
					{@render evalBtn("Good", Rating.Good, "Space or 3")}
					{@render evalBtn("Easy", Rating.Easy, "4")}
			{/if}
		</div>
	</div>
{:else}
	<p>Congratulations you finished this deck for now! Come back later</p>
{/if}


<style>
	.flashcard {
		background-color: white;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		width: 900px;
		border-radius: 5px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12),
		0 1px 2px rgba(0, 0, 0, 0.24);
		margin-top: 34px;
		min-height: 100px;
		padding: 24px 16px;
		padding-top: 36px;
		min-height: 750px;
		position: relative;
		padding-bottom: 75px;
	}
	.divider {
		width: 100%;
		border: none;
		border-top: 2px solid #e5e5e5;
		margin: 24px 0;
	}
	.single-board-block {
		display: flex;
		position: relative;
		flex-direction: column;
		align-items: center;
		padding-top: 10px;
	}
	.board-grid-block {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 20px;
		position: relative;
		padding-top: 10px;
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
	.eval-form {
		display: flex;
		gap: 20px;
	}
	.std-btn {
		padding: 4px 8px;
	}
</style>
