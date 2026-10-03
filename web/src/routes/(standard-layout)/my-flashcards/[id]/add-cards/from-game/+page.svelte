<script>
	import { getContext, onMount } from "svelte"
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import { stageName } from "$lib/stages.js"
	import { startImport, saveChesscomUsername } from "./import.remote.js"
	import { current, follow, resume } from "./import-state.svelte.js"

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
	// a busy month is hundreds of games: the list shows the newest, and
	// "Earlier games" walks back through the rest, into the months before
	const PAGE = 30;
	let shown = $state(PAGE);
	let loading = $state(false);
	let loadError = $state(null);

	// Chess.com's public API answers a browser directly; asked from a server
	// it puts a bot check in the way, so the games are fetched from here
	const API = "https://api.chess.com/pub/player";

	// each "Show games" is a load of its own; one that a later one overtook
	// leaves the lists alone
	let latestLoad = 0;

	const loadMonth = async () => {
		const url = earlier.at(-1);
		if (!url) return;
		const load = latestLoad;
		const response = await fetch(url);
		if (!response.ok) throw new Error("Chess.com did not answer");
		const month = (await response.json()).games
			.filter(game => game.rules === "chess" && game.pgn)
			.sort((a, b) => b.end_time - a.end_time);
		if (load !== latestLoad) return;
		earlier = earlier.slice(0, -1);
		games = [...games, ...month];
	}

	const loadGames = async () => {
		const name = username.trim();
		if (!name) return;
		const load = ++latestLoad;
		loading = true;
		loadError = null;
		try {
			const response = await fetch(`${API}/${encodeURIComponent(name.toLowerCase())}/games/archives`);
			if (load !== latestLoad) return;
			if (response.status === 404) throw new Error(`No Chess.com player called "${name}"`);
			if (!response.ok) throw new Error("Chess.com did not answer");
			const archives = (await response.json()).archives;
			if (load !== latestLoad) return;
			earlier = archives;
			games = [];
			shown = PAGE;
			player = name.toLowerCase();
			// a month that has only just begun may hold nothing yet
			while (games.length === 0 && earlier.length > 0 && load === latestLoad) await loadMonth();
			// remembering the name is a convenience; the games are already here
			if (name !== data.chesscomUsername) saveChesscomUsername({ username: name }).catch(() => {});
		} catch (err) {
			if (load !== latestLoad) return;
			player = null;
			games = [];
			loadError = err.message;
		} finally {
			if (load === latestLoad) loading = false;
		}
	}

	const showEarlier = async () => {
		shown += PAGE;
		if (shown <= games.length || earlier.length === 0) return;
		loading = true;
		try { await loadMonth(); }
		catch (err) { loadError = err.message; }
		finally { loading = false; }
	}

	onMount(() => {
		resume(deck);
		if (username) loadGames();
	});

	const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;
	const DRAWS = ["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"];
	// "900+10" is "15 + 10", "600" is "10 min", "1/259200" (daily) is "3 days"
	const timeControl = raw => {
		const daily = /^1\/(\d+)$/.exec(raw);
		if (daily) return plural(Math.round(daily[1] / 86400), "day");
		const [base, increment] = raw.split("+").map(Number);
		const clock = base >= 60 ? String(+(base / 60).toFixed(1)) : `${base} sec`;
		return increment ? `${clock} + ${increment}` : base >= 60 ? `${clock} min` : clock;
	}
	const rowOf = game => {
		const color = game.white.username.toLowerCase() === player ? "w" : "b";
		const me = color === "w" ? game.white : game.black;
		return {
			color,
			time: timeControl(game.time_control),
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

	let summary = $derived.by(() => {
		if (job?.phase !== "done") return null;
		const { cardIds } = job.result;
		return cardIds.length === 0 ? "Nothing to make a card of in this game." : `${plural(cardIds.length, "card")} added.`;
	});
	let progress = $derived.by(() => {
		if (!job) return null;
		if (job.phase === "queued") return job.ahead > 0 ? `Waiting for ${plural(job.ahead, "game")} ahead of yours` : "Starting";
		if (job.phase === "analysing") return job.total > 0 ? `Analysing the game: position ${job.done} of ${job.total}` : "Starting";
		if (job.phase === "explaining") return `Writing the explanations: ${job.done} of ${job.total}`;
		if (job.phase === "saving") return "Adding the cards";
		return null;
	});
</script>

{#snippet speed(timeClass)}
	{#if timeClass === "rapid"}
		<svg class="speed speed-rapid" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-label="Rapid">
			<circle cx="12" cy="14" r="7.5" /><path d="M9.5 2.5h5M12 2.5v4M12 14l3-3.5" />
		</svg>
	{:else if timeClass === "blitz"}
		<svg class="speed speed-blitz" viewBox="0 0 24 24" fill="currentColor" aria-label="Blitz">
			<path d="M14 1.5 4.5 13.5h6L9 22.5l10.5-13h-6.5z" />
		</svg>
	{:else if timeClass === "bullet"}
		<svg class="speed speed-bullet" viewBox="0 0 24 24" fill="currentColor" aria-label="Bullet">
			<path d="M2.5 8h10.5c4.5 0 7.5 2 8.5 4-1 2-4 4-8.5 4H2.5z" />
		</svg>
	{:else}
		<svg class="speed speed-daily" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-label="Daily">
			<circle cx="12" cy="12" r="4.5" stroke="none" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
		</svg>
	{/if}
{/snippet}

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
		{:else}
			<p class="status status-done">{summary}</p>
		{/if}
	</section>
	{/if}

	{#if player}
	<section>
		{#if games.length === 0 && !loading}
			<p class="section-note">No games yet.</p>
		{/if}
		<ul class="games">
			{#each games.slice(0, shown) as game (game.url)}
				{@const row = rowOf(game)}
				<li>
					<button class="game" class:current={job?.url === game.url} onclick={() => importGame(game)}>
						<span class="time">
							{@render speed(game.time_class)}
							<span class="time-control">{row.time}</span>
						</span>
						<span class="players">
							{#each [["w", game.white], ["b", game.black]] as [side, who]}
								<span class="player"><span class="side side-{side}"></span><span class="name">{who.username}</span> <span class="rating">({who.rating})</span></span>
							{/each}
						</span>
						<span class="result result-{row.result.toLowerCase()}">{row.result}</span>
						<span class="date">{row.date}</span>
					</button>
				</li>
			{/each}
		</ul>
		{#if shown < games.length || earlier.length > 0}
			<button class="std-btn" onclick={showEarlier}>{loading ? "Loading" : "Earlier games"}</button>
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
		grid-template-columns: 64px 1fr 50px 100px;
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
	.time-control {
		color: rgba(0, 0, 0, 0.6);
	}
	.date {
		text-align: right;
	}
	.time {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.time-control {
		font-size: 0.8rem;
		white-space: nowrap;
	}
	.speed {
		width: 22px;
		height: 22px;
	}
	.speed-rapid {
		color: #6c9d2a;
	}
	.speed-blitz,
	.speed-bullet {
		color: #e0a800;
	}
	.speed-daily {
		color: #e07b1a;
	}
	.players {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.player {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.side {
		flex: none;
		width: 11px;
		height: 11px;
		border-radius: 2px;
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
