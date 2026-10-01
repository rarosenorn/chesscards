<script>
	import { getContext, onMount } from "svelte"
	import { page } from "$app/state"
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import { stageName } from "$lib/stages.js"
	import { startImport, saveChesscomUsername } from "./import.remote.js"
	import { current, follow, resume } from "./import-state.svelte.js"
	import { deleteCards } from "../../browse/browse.remote.js"

	let { data } = $props();
	const deck = getContext("deck");

	const KINDS = [["blunder", "Blunders"], ["mistake", "Mistakes"], ["inaccuracy", "Inaccuracies"]];
	let kinds = $state({ blunder: true, mistake: true, inaccuracy: true });

	let stagesSorted = $derived([...deck.stages].sort((a, b) => a.position - b.position));
	let stageId = $state(null);
	let validStageId = $derived(
		stagesSorted.some(stage => stage.id === stageId) ? stageId : stagesSorted.at(-1)?.id
	);

	// svelte-ignore state_referenced_locally
	let username = $state(data.chesscomUsername);
	// the player the list below belongs to, as Chess.com spells the name
	let player = $state(null);
	let games = $state([]);
	// month archives not loaded yet, newest last
	let earlier = $state([]);
	let loading = $state(false);
	let loadError = $state(null);

	// Chess.com's public API answers a browser directly; asked from a server
	// it puts a bot check in the way, so the games are fetched from here
	const API = "https://api.chess.com/pub/player";

	const loadMonth = async () => {
		const url = earlier.at(-1);
		if (!url) return;
		const response = await fetch(url);
		if (!response.ok) throw new Error("Chess.com did not answer");
		const month = (await response.json()).games
			.filter(game => game.rules === "chess" && game.pgn)
			.sort((a, b) => b.end_time - a.end_time);
		earlier = earlier.slice(0, -1);
		games = [...games, ...month];
	}

	const loadGames = async () => {
		const name = username.trim();
		if (!name) return;
		loading = true;
		loadError = null;
		try {
			const response = await fetch(`${API}/${encodeURIComponent(name.toLowerCase())}/games/archives`);
			if (response.status === 404) throw new Error(`No Chess.com player called "${name}"`);
			if (!response.ok) throw new Error("Chess.com did not answer");
			earlier = (await response.json()).archives;
			games = [];
			player = name.toLowerCase();
			// a month that has only just begun may hold nothing yet
			while (games.length === 0 && earlier.length > 0) await loadMonth();
			if (name !== data.chesscomUsername) saveChesscomUsername({ username: name });
		} catch (err) {
			player = null;
			games = [];
			loadError = err.message;
		} finally {
			loading = false;
		}
	}

	const loadEarlier = async () => {
		loading = true;
		try { await loadMonth(); }
		catch (err) { loadError = err.message; }
		finally { loading = false; }
	}

	onMount(() => {
		resume(deck);
		if (username) loadGames();
	});

	const DRAWS = ["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"];
	const rowOf = game => {
		const color = game.white.username.toLowerCase() === player ? "w" : "b";
		const me = color === "w" ? game.white : game.black;
		const opponent = color === "w" ? game.black : game.white;
		return {
			color, opponent,
			result: me.result === "win" ? "Won" : DRAWS.includes(me.result) ? "Draw" : "Lost",
			date: new Date(game.end_time * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
		};
	}

	// the import under way or the last one, when it is this deck's
	let job = $derived(current.job?.deckId === deck.id ? current.job : null);
	// a game that could not be started; the one already running is untouched
	let startError = $state(null);

	const messageOf = err => err?.body?.message ?? err?.message ?? "Something went wrong";

	const importGame = async game => {
		startError = null;
		try {
			const { jobId } = await startImport({
				deckId: deck.id,
				stageId: deck.chapters ? validStageId : null,
				pgn: game.pgn,
				color: rowOf(game).color,
				kinds: KINDS.map(([kind]) => kind).filter(kind => kinds[kind])
			});
			follow(deck, jobId, game.url);
		} catch (err) {
			startError = messageOf(err);
		}
	}

	const undo = async () => {
		const ids = job.result.cardIds;
		// cards already deleted by hand leave nothing to refuse
		try { await deleteCards({ cardIds: ids }); } catch { /* none of them were left */ }
		deck.cards = deck.cards.filter(card => !ids.includes(card.id));
		current.job = { ...current.job, undone: true };
	}

	const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;
	let summary = $derived.by(() => {
		if (job?.phase !== "done") return null;
		const { cardIds, counts, unexplained } = job.result;
		if (cardIds.length === 0) return "Nothing to make a card of in this game.";
		const parts = [
			counts.blunder && plural(counts.blunder, "blunder"),
			counts.mistake && plural(counts.mistake, "mistake"),
			counts.inaccuracy && plural(counts.inaccuracy, "inaccuracy", "inaccuracies")
		].filter(Boolean);
		return `Added ${plural(cardIds.length, "card")}: ${parts.join(", ")}.`
			+ (unexplained ? ` ${plural(unexplained, "card")} got no explanation.` : "");
	});
	let progress = $derived.by(() => {
		if (!job) return null;
		if (job.phase === "queued") return job.ahead > 0 ? `Waiting for ${plural(job.ahead, "game")} ahead of yours` : "Starting";
		if (job.phase === "analysing") return `Analysing the game: position ${job.done} of ${job.total}`;
		if (job.phase === "explaining") return `Writing the explanations: ${job.done} of ${job.total}`;
		if (job.phase === "saving") return "Adding the cards";
		return null;
	});
</script>

<StandardLayout>
	<section>
		<h3>Your games</h3>
		<p class="section-note">
			Pick a game and its blunders, mistakes and inaccuracies become cards in this deck.
		</p>
		<form class="username-form" onsubmit={e => { e.preventDefault(); loadGames(); }}>
			<input bind:value={username} placeholder="Chess.com username" autocomplete="off" />
			<button class="std-btn">Show games</button>
		</form>
		{#if loadError}
			<p class="status status-failed">{loadError}</p>
		{/if}
	</section>

	<section>
		<h3>Make cards of</h3>
		<div class="options">
			{#each KINDS as [kind, label]}
				<label><input type="checkbox" bind:checked={kinds[kind]} /> {label}</label>
			{/each}
			{#if deck.chapters}
				<label class="chapter">
					Chapter
					<select value={validStageId} onchange={e => stageId = e.currentTarget.value}>
						{#each stagesSorted as stage (stage.id)}
							<option value={stage.id}>{stageName(stage)}</option>
						{/each}
					</select>
				</label>
			{/if}
		</div>
	</section>

	{#if startError}
	<section>
		<p class="status status-failed">{startError}</p>
	</section>
	{/if}

	{#if job}
	<section>
		{#if progress}
			<p class="status">{progress}</p>
			<progress value={job.total ? job.done : undefined} max={job.total || undefined}></progress>
		{:else if job.phase === "failed"}
			<p class="status status-failed">{job.error}</p>
		{:else if job.undone}
			<p class="status">Removed the cards again.</p>
		{:else}
			<p class="status status-done">{summary}</p>
			{#if job.result.cardIds.length > 0}
				<div class="after">
					<a class="std-btn" href="/my-flashcards/{page.params.id}/browse">See them in Cards</a>
					<button class="std-btn" onclick={undo}>Undo</button>
				</div>
			{/if}
		{/if}
	</section>
	{/if}

	{#if player}
	<section>
		{#if games.length === 0 && !loading}
			<p class="section-note">No games yet.</p>
		{/if}
		<ul class="games">
			{#each games as game (game.url)}
				{@const row = rowOf(game)}
				<li>
					<button class="game" class:current={job?.url === game.url} onclick={() => importGame(game)}>
						<span class="date">{row.date}</span>
						<span class="side side-{row.color}" aria-label={row.color === "w" ? "You were White" : "You were Black"}></span>
						<span class="opponent">{row.opponent.username} <span class="rating">({row.opponent.rating})</span></span>
						<span class="time-class">{game.time_class}</span>
						<span class="result result-{row.result.toLowerCase()}">{row.result}</span>
					</button>
				</li>
			{/each}
		</ul>
		{#if earlier.length > 0}
			<button class="std-btn" onclick={loadEarlier}>{loading ? "Loading" : "Earlier games"}</button>
		{/if}
	</section>
	{/if}
</StandardLayout>

<style>
	section {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 8px;
		padding: 18px 0;
	}
	section + section {
		border-top: 1px solid rgba(0, 0, 0, 0.1);
	}
	section:first-child {
		padding-top: 0;
	}
	h3 {
		margin: 0;
		font-size: 1.05rem;
	}
	.section-note {
		margin: 0;
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.6);
	}
	.username-form {
		display: flex;
		gap: 8px;
	}
	.username-form input {
		width: 280px;
		border: 1px solid rgba(0, 0, 0, 0.25);
		border-radius: 4px;
		padding: 6px 8px;
	}
	.username-form .std-btn,
	.after .std-btn,
	section > .std-btn {
		padding: 6px 12px;
		border-radius: 4px;
	}
	.options {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 18px;
		font-size: 0.95rem;
	}
	.options label {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.options .chapter {
		margin-left: 12px;
	}
	.status {
		margin: 0;
		font-size: 0.95rem;
	}
	.status-failed {
		color: #b3261e;
	}
	.status-done {
		color: #1b6e3c;
	}
	progress {
		width: 100%;
		max-width: 420px;
	}
	.after {
		display: flex;
		gap: 8px;
	}
	.games {
		list-style: none;
		margin: 0;
		padding: 0;
		width: 100%;
	}
	.games li + li {
		border-top: 1px solid rgba(0, 0, 0, 0.07);
	}
	.game {
		width: 100%;
		display: grid;
		grid-template-columns: 110px 14px 1fr 80px 50px;
		align-items: center;
		gap: 12px;
		padding: 8px 6px;
		border: 0;
		background: none;
		text-align: left;
		font: inherit;
		font-size: 0.93rem;
		cursor: pointer;
	}
	.game:hover {
		background-color: rgba(0, 0, 0, 0.04);
	}
	.game.current {
		background-color: rgba(0, 0, 0, 0.07);
	}
	.date,
	.rating,
	.time-class {
		color: rgba(0, 0, 0, 0.6);
	}
	.side {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 1px solid rgba(0, 0, 0, 0.55);
	}
	.side-w {
		background-color: white;
	}
	.side-b {
		background-color: #333;
	}
	.result-won {
		color: #1b6e3c;
	}
	.result-lost {
		color: #b3261e;
	}
</style>
