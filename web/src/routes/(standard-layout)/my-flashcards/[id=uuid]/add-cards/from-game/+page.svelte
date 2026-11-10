<script>
	import { getContext, onMount } from "svelte"
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import { deckChoices } from "$lib/deck-tree.js"
	import { startImport, saveUsername } from "./import.remote.js"
	import { current, follow, resume, cancel } from "./import-state.svelte.js"
	import { SPEED_ICON_PATHS } from "$lib/lichess-speed-icons.js"
	import { SITE_LOGOS } from "$lib/game-site-logos.js"
	import { confirmModal } from "$lib/modals.svelte.js"

	let { data } = $props();
	const deck = getContext("deck");

	const KINDS = [["blunder", "Blunders"], ["mistake", "Mistakes"], ["inaccuracy", "Inaccuracies"]];
	let kinds = $state({ blunder: true, mistake: true, inaccuracy: true });

	// the deck and the decks inside it, as an outline: the cards go in the
	// deck itself unless one inside it is chosen (not a marketplace deck's)
	let choices = $derived(deckChoices(deck.decks));
	let targetId = $state(null);
	let validTargetId = $derived(
		choices.some(choice => choice.id === targetId && !choice.disabled) ? targetId : deck.id
	);

	// a busy month is hundreds of games: the list opens on the newest few —
	// the game just played is nearly always the one wanted — and "Load more"
	// walks back through the rest, a page at a time
	const FIRST = 3;
	const PAGE = 30;

	const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;
	// "900+10" is "15 + 10", "600" is "10 min", "1/259200" (daily) is "3 days"
	const timeControl = raw => {
		const daily = /^1\/(\d+)$/.exec(raw);
		if (daily) return plural(Math.round(daily[1] / 86400), "day");
		const [base, increment] = raw.split("+").map(Number);
		const clock = base >= 60 ? String(+(base / 60).toFixed(1)) : `${base} sec`;
		return increment ? `${clock} + ${increment}` : base >= 60 ? `${clock} min` : clock;
	}

	// The two sites a game can be fetched from. Both answer a browser
	// directly (Chess.com puts a bot check in a server's way), so the games
	// are fetched from here. A site's `open` looks the player up and answers
	// with the way to their games: a function that fetches the next batch,
	// newest first, and says whether older ones remain. A game of either
	// site is made into the one shape the list shows: { url, pgn, color,
	// white, black, speed, time, result, ended }, `color` being the
	// player's.
	const CHESSCOM = "https://api.chess.com/pub/player";
	const CHESSCOM_DRAWS = ["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"];
	const fromChesscom = (game, player) => {
		const color = game.white.username.toLowerCase() === player ? "w" : "b";
		const mine = (color === "w" ? game.white : game.black).result;
		return {
			url: game.url, pgn: game.pgn, color,
			white: { name: game.white.username, rating: game.white.rating },
			black: { name: game.black.username, rating: game.black.rating },
			speed: game.time_class,
			time: timeControl(game.time_control),
			result: mine === "win" ? "Won" : CHESSCOM_DRAWS.includes(mine) ? "Draw" : "Lost",
			ended: game.end_time * 1000
		};
	}
	const openChesscom = async name => {
		const player = name.toLowerCase();
		const response = await fetch(`${CHESSCOM}/${encodeURIComponent(player)}/games/archives`);
		if (response.status === 404) throw new Error(`No Chess.com player called "${name}"`);
		if (!response.ok) throw new Error("Chess.com did not answer");
		// a month each, newest last
		const months = (await response.json()).archives;
		return async () => {
			if (months.length === 0) return { games: [], more: false };
			const response = await fetch(months.at(-1));
			if (!response.ok) throw new Error("Chess.com did not answer");
			const month = (await response.json()).games
				.filter(game => game.rules === "chess" && game.pgn)
				.sort((a, b) => b.end_time - a.end_time);
			months.pop();
			return { games: month.map(game => fromChesscom(game, player)), more: months.length > 0 };
		};
	}

	const LICHESS = "https://lichess.org/api/games/user";
	// Lichess answers a second download from the same place with 429 while
	// the first is still running, so they go one after the other, each read
	// to its end before the next starts
	let lichessLine = Promise.resolve();
	const lichessFetch = (url, options) => {
		const result = lichessLine.then(async () => {
			const response = await fetch(url, options);
			return { status: response.status, ok: response.ok, body: await response.text() };
		});
		lichessLine = result.catch(() => {});
		return result;
	}
	const fromLichess = (game, player) => {
		const side = color => {
			const who = game.players[color];
			return {
				name: who.user?.name ?? (who.aiLevel ? `Stockfish level ${who.aiLevel}` : "Anonymous"),
				rating: who.rating ?? null
			};
		};
		const color = game.players.white.user?.id === player ? "w" : "b";
		return {
			url: `https://lichess.org/${game.id}`, pgn: game.pgn, color,
			white: side("white"), black: side("black"),
			speed: { ultraBullet: "bullet", correspondence: "daily" }[game.speed] ?? game.speed,
			time: game.clock ? timeControl(`${game.clock.initial}+${game.clock.increment}`)
				: game.daysPerTurn ? plural(game.daysPerTurn, "day") : "",
			result: !game.winner ? "Draw" : (game.winner === "white") === (color === "w") ? "Won" : "Lost",
			ended: game.lastMoveAt
		};
	}
	// Lichess has no look-up of its own to make: a name it does not know
	// fails the first batch
	const openLichess = async name => {
		const player = name.toLowerCase();
		// the next page ends where the last one's oldest game began
		let until = null;
		return async () => {
			const query = new URLSearchParams({
				max: PAGE, pgnInJson: true, finished: true,
				perfType: "ultraBullet,bullet,blitz,rapid,classical,correspondence"
			});
			if (until != null) query.set("until", until);
			const response = await lichessFetch(`${LICHESS}/${encodeURIComponent(name)}?${query}`, { headers: { Accept: "application/x-ndjson" } });
			if (response.status === 404) throw new Error(`No Lichess player called "${name}"`);
			// Two limits answer 429 and neither says how long. Too many
			// requests: Lichess's rule is a full minute. A download it still
			// counts as running ("only run 1 request(s) at a time", e.g. one
			// cut off halfway): it forgets that within the hour.
			if (response.status === 429) {
				let said = null;
				try { said = JSON.parse(response.body); } catch {}
				const stuck = /at a time/.test(said?.error ?? "");
				throw new Error(`Lichess rate limit reached. ${stuck ? "It can take up to 1 hour to clear." : "Please try again in 1 minute."}`);
			}
			if (!response.ok) throw new Error("Lichess did not answer");
			const page = response.body.split("\n").filter(Boolean).map(line => JSON.parse(line));
			if (page.length > 0) until = page.at(-1).createdAt - 1;
			return {
				games: page.filter(game => game.variant === "standard" && game.pgn).map(game => fromLichess(game, player)),
				more: page.length === PAGE
			};
		};
	}

	const SITES = {
		chesscom: { name: "Chess.com", open: openChesscom },
		lichess: { name: "Lichess", open: openLichess }
	};
	// svelte-ignore state_referenced_locally
	let usernames = $state({ ...data.usernames });
	// the site the list below was fetched from: a fetch from the other one
	// replaces it
	let site = $state(null);
	let games = $state([]);
	// the fetched site's way to its next batch, and whether there is one
	let nextBatch = null;
	let hasEarlier = $state(false);
	let shown = $state(FIRST);
	let loading = $state(false);
	// the site a Fetch is under way for: its button turns while it is
	let fetching = $state(null);
	let loadError = $state(null);

	// each Fetch is a load of its own; one that a later one overtook leaves
	// the list alone
	let latestLoad = 0;

	const loadGames = async key => {
		const name = usernames[key].trim();
		if (!name) return;
		const load = ++latestLoad;
		loading = true;
		fetching = key;
		loadError = null;
		try {
			const next = await SITES[key].open(name);
			let found = [], more = true;
			// a month that has only just begun may hold nothing yet
			while (found.length === 0 && more && load === latestLoad) ({ games: found, more } = await next());
			if (load !== latestLoad) return;
			site = key;
			games = found;
			nextBatch = next;
			hasEarlier = more;
			shown = FIRST;
			// remembering is a convenience; the games are already here
			if (name !== data.usernames[key]) saveUsername({ site: key, username: name }).catch(() => {});
		} catch (err) {
			if (load !== latestLoad) return;
			site = null;
			games = [];
			hasEarlier = false;
			loadError = err.message;
		} finally {
			if (load === latestLoad) { loading = false; fetching = null; }
		}
	}

	const showEarlier = async () => {
		if (loading) return;
		shown += PAGE;
		if (shown <= games.length || !hasEarlier) return;
		const load = latestLoad;
		loading = true;
		try {
			let found = [], more = true;
			while (found.length === 0 && more && load === latestLoad) ({ games: found, more } = await nextBatch());
			if (load !== latestLoad) return;
			games = [...games, ...found];
			hasEarlier = more;
		} catch (err) {
			if (load === latestLoad) loadError = err.message;
		} finally {
			if (load === latestLoad) loading = false;
		}
	}

	// no games until they are asked for: the page opens with the names filled
	// in and nothing fetched
	onMount(() => resume(deck, data.activeImport));

	const dateOf = game => new Date(game.ended).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

	// the import under way or the last one, when it is this deck's
	let job = $derived(current.job?.deckId === deck.id ? current.job : null);
	// a game that could not be started; the one already running is untouched
	let startError = $state(null);

	const messageOf = err => err?.body?.message ?? err?.message ?? "Something went wrong";

	// a click on a game asks what to make of it before anything is made
	const chooseGame = async game => {
		const go = await confirmModal({
			title: "Make cards from this game",
			message: `${game.white.name} vs ${game.black.name}, ${dateOf(game)}`,
			body: gameOptions,
			confirmLabel: "Make cards"
		});
		if (go) importGame(game);
	}

	const importGame = async game => {
		startError = null;
		try {
			const { jobId } = await startImport({
				deckId: deck.id,
				targetDeckId: validTargetId,
				pgn: game.pgn,
				color: game.color,
				kinds: KINDS.map(([kind]) => kind).filter(kind => kinds[kind]),
				url: game.url
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
		if (job.phase === "explaining") return `Writing explanations: ${job.done} of ${job.total}`;
		if (job.phase === "saving") return "Adding the cards";
		return null;
	});
</script>

<!-- what the dialog over a chosen game asks -->
{#snippet gameOptions()}
	<div class="game-options">
		{#each KINDS as [kind, label]}
			<label><input type="checkbox" bind:checked={kinds[kind]} /> {label}</label>
		{/each}
		{#if choices.length > 1}
			<label class="subdeck">
				Deck
				<select value={validTargetId} onchange={e => targetId = e.currentTarget.value}>
					{#each choices as choice (choice.id)}
						<option value={choice.id} disabled={choice.disabled}>{choice.label}</option>
					{/each}
				</select>
			</label>
		{/if}
	</div>
{/snippet}

<!-- a game's speed, drawn the way the site it came from draws it -->
{#snippet speed(kind)}
	{#if site === "lichess"}
		<svg class="speed speed-{kind}" viewBox="0 0 512 512" fill="currentColor" aria-label={kind}>
			<path transform="translate(0 512) scale(1 -1)" d={SPEED_ICON_PATHS[kind] ?? SPEED_ICON_PATHS.daily} />
		</svg>
	{:else if kind === "rapid"}
		<svg class="speed speed-rapid" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-label="rapid">
			<circle cx="12" cy="14" r="7.5" /><path d="M9.5 2.5h5M12 2.5v4M12 14l3-3.5" />
		</svg>
	{:else if kind === "blitz"}
		<svg class="speed speed-blitz" viewBox="0 0 24 24" fill="currentColor" aria-label="blitz">
			<path d="M14 1.5 4.5 13.5h6L9 22.5l10.5-13h-6.5z" />
		</svg>
	{:else if kind === "bullet"}
		<svg class="speed speed-bullet" viewBox="0 0 24 24" fill="currentColor" aria-label="bullet">
			<path d="M2.5 8h10.5c4.5 0 7.5 2 8.5 4-1 2-4 4-8.5 4H2.5z" />
		</svg>
	{:else}
		<svg class="speed speed-daily" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-label="daily">
			<circle cx="12" cy="12" r="4.5" stroke="none" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
		</svg>
	{/if}
{/snippet}

<StandardLayout>
	<section>
		<h3>Enter username to fetch games</h3>
		<div class="sites">
			{#each Object.entries(SITES) as [key, { name }] (key)}
				<form class="username-form" onsubmit={e => { e.preventDefault(); loadGames(key); }}>
					<svg class="logo" viewBox="0 0 24 24" fill={SITE_LOGOS[key].color} aria-hidden="true"><path d={SITE_LOGOS[key].path} /></svg>
					<input bind:value={usernames[key]} placeholder="username" aria-label="{name} username" autocomplete="off" />
					<button class="std-btn fetch-btn" class:fetching={fetching === key} aria-busy={fetching === key}>
						<span class="label">Fetch</span>
						{#if fetching === key}<span class="spinner" role="status" aria-label="Fetching games"></span>{/if}
					</button>
				</form>
			{/each}
		</div>
		{#if loadError}
			<p class="status status-failed">{loadError}</p>
		{/if}
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
			<div class="progress-row">
				<progress value={job.total ? job.done : undefined} max={job.total || undefined}></progress>
				{#if job.phase !== "saving"}<button class="std-btn" onclick={cancel}>Cancel</button>{/if}
			</div>
		{:else if job.phase === "failed"}
			<p class="status status-failed">{job.error}</p>
		{:else}
			<p class="status status-done">{summary}</p>
		{/if}
	</section>
	{/if}

	{#if site}
	<section>
		{#if games.length === 0 && !loading}
			<p class="section-note">No games yet.</p>
		{:else}
			<h3>Choose game to make cards from your blunders, mistakes and inaccuracies</h3>
		{/if}
		<ul class="games">
			{#each games.slice(0, shown) as game (game.url)}
				<li>
					<button class="game" class:current={job?.url === game.url} onclick={() => chooseGame(game)}>
						<span class="time">
							{@render speed(game.speed)}
							<span class="time-control">{game.time}</span>
						</span>
						<span class="players">
							{#each [["w", game.white], ["b", game.black]] as [side, who]}
								<span class="player"><span class="side side-{side}"></span><span class="name">{who.name}</span>{#if who.rating != null}<span class="rating">({who.rating})</span>{/if}</span>
							{/each}
						</span>
						<span class="result result-{game.result.toLowerCase()}">{game.result}</span>
						<span class="date">{dateOf(game)}</span>
					</button>
				</li>
			{/each}
		</ul>
		{#if shown < games.length || hasEarlier}
			<button class="std-btn" onclick={showEarlier}>{loading ? "Loading" : "Load more"}</button>
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
	/* in by a game row's own padding, so a heading starts where the rows'
	   content does and not at their hover edge */
	h3 {
		margin: 0;
		padding-left: 6px;
		font-size: 1.05rem;
		font-weight: 400;
	}
	.section-note {
		margin: 0;
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.6);
	}
	.sites {
		display: flex;
		flex-wrap: wrap;
		gap: 12px 32px;
	}
	.username-form {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.logo {
		flex: none;
		width: 22px;
		height: 22px;
	}
	.username-form input {
		width: 200px;
		border: 1px solid rgba(0, 0, 0, 0.25);
		border-radius: 4px;
		padding: 6px 8px;
	}
	.username-form .std-btn,
	.progress-row .std-btn,
	section > .std-btn {
		padding: 6px 12px;
		border-radius: 4px;
	}
	/* the button keeps its size while it turns: the word stays in place,
	   unseen, and the ring sits over it */
	.fetch-btn {
		position: relative;
	}
	.fetch-btn.fetching .label {
		visibility: hidden;
	}
	.spinner {
		position: absolute;
		inset: 0;
		margin: auto;
		width: 14px;
		height: 14px;
		box-sizing: border-box;
		border: 2px solid rgba(0, 0, 0, 0.2);
		border-top-color: rgba(0, 0, 0, 0.65);
		border-radius: 50%;
		animation: fetch-spin 0.7s linear infinite;
	}
	@keyframes fetch-spin {
		to { transform: rotate(360deg); }
	}
	.game-options {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 8px;
		font-size: 0.95rem;
	}
	.game-options label {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.game-options .subdeck {
		margin-top: 4px;
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
	.progress-row {
		display: flex;
		align-items: center;
		gap: 12px;
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
		overflow: visible;
	}
	.speed-rapid,
	.speed-classical {
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
	.rating {
		white-space: nowrap;
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
