<script>
	import { enhance } from "$app/forms"
	import { goto } from "$app/navigation"
	import { authClient } from "$lib/auth-client.js"
	import "cm-chessboard/assets/chessboard.css"
	import { Chessboard } from "cm-chessboard/src/Chessboard.js"
	import { PIECE_SETS, BOARD_THEMES, BORDER_TYPES, ANIMATION_DURATIONS, boardStyleProps, hasBlackBorder } from "$lib/board-prefs.js"
	import { typedConfirmModal } from "$lib/modals.svelte.js"
	import { ROLLOVER_HOURS, DEFAULT_ROLLOVER_HOUR } from "$lib/rollover.js"
	import { RETENTIONS, DEFAULT_RETENTION } from "$lib/retention.js"
	import TwoFactorSettings from "$lib/components/TwoFactorSettings.svelte"

	let { data, form } = $props();

	let displayName = $state(data.user.displayName ?? "");
	let prefs = $state({ ...data.boardPrefs });
	let rolloverHour = $state(data.rolloverHour ?? DEFAULT_ROLLOVER_HOUR);
	let desiredRetention = $state(data.desiredRetention ?? DEFAULT_RETENTION);
	// 4 -> "4am", for the pills below
	const hourLabel = hour => `${hour}am`;

	// the last fit of the scheduling to the user's reviews, in words
	let optimizing = $state(false);
	const optimizeSubmit = () => {
		optimizing = true;
		return async ({ update }) => { await update({ reset: false }); optimizing = false; };
	};
	const fitStatus = (last, timeZone) => {
		if (!last) return "Not optimized yet: study uses the default parameters.";
		const when = new Date(last.optimizedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone });
		const from = `Last optimized ${when} from ${last.reviews.toLocaleString("en-US")} ${last.reviews === 1 ? "review" : "reviews"}`;
		return last.defaults ? `${from}; the default parameters are still in use.` : `${from}.`;
	};

	const themeLabels = {
		"default": "Default",
		"default-contrast": "Default contrast",
		"green": "Green",
		"blue": "Blue",
		"chess-club": "Chess club",
		"chessboard-js": "Chessboard.js",
		"black-and-white": "Black & white"
	};
	const pieceLabels = { standard: "Standard", staunty: "Staunty" };
	const borderLabels = { black: "Black", frame: "Frame", none: "None" };
	const animationLabels = { 300: "Normal", 150: "Fast", 0: "Off" };

	// a position with some development so the preview shows the pieces well
	const previewFen = "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 5";

	let previewElement = $state();

	// picking an animation speed is invisible on a still board: demo it by
	// hopping the knight out and back at the chosen speed. Reads previewBoard
	// at every step (not a captured instance): selection changes can rebuild
	// the board mid-demo and the demo must carry on on the new one.
	let previewBoard = null;
	const demoAnimation = async () => {
		try {
			await new Promise(resolve => setTimeout(resolve, 150));
			await previewBoard?.movePiece("c3", "d5", true);
			await new Promise(resolve => setTimeout(resolve, 250));
			await previewBoard?.movePiece("d5", "c3", true);
		} catch {
			// the board was rebuilt between steps; the next demo starts clean
		}
	};

	// every click on an animation pill requests a demo, re-clicks included
	let demoRequest = $state(0);
	let playedDemoRequest = 0;

	// cm-chessboard can't restyle in place: rebuild the preview on every change
	// (boardStyleProps reads all prefs, so the effect tracks them)
	$effect(() => {
		void demoRequest;
		if (!previewElement) return;
		const board = new Chessboard(previewElement, {
			position: previewFen,
			assetsUrl: "/chessboard-assets/",
			// both sprite sets can be shown in one session
			assetsCache: false,
			style: boardStyleProps(prefs)
		});
		previewBoard = board;
		if (demoRequest !== playedDemoRequest) {
			playedDemoRequest = demoRequest;
			demoAnimation();
		}
		return () => {
			if (previewBoard === board) previewBoard = null;
			board.destroy();
		};
	});

	// keep the bound state authoritative: a reset would visually deselect pills
	const keepState = () => async ({ update }) => update({ reset: false });

	const logout = async () => {
		await authClient.signOut();
		await goto("/login", { invalidateAll: true });
	}

	// deletion is double-confirmed: typed modal, then a link sent by email
	let deleteRequested = $state(false);
	const requestDelete = async () => {
		const confirmed = await typedConfirmModal({
			title: "Delete account",
			message: "Deleting your account deletes your decks, cards and review history."
				+ (data.hasPublished ? " Decks you published stay with those who have them, off sale." : ""),
			requiredText: data.user.email,
			confirmLabel: "Delete account"
		});
		if (!confirmed) return;
		const { error } = await authClient.deleteUser({ callbackURL: "/" });
		deleteRequested = !error;
	}
</script>

<div class="container card-surface">
	<section>
		<h3><label for="display-name">Display name</label></h3>
		<form method="POST" action="?/name" class="name-row" use:enhance={keepState}>
			<input id="display-name" name="display-name" bind:value={displayName} maxlength="100" />
			<button class="std-btn">Change</button>
			{#if form?.saved === "name"}
				<span class="saved">Saved</span>
			{:else if form?.failed === "name"}
				<span class="error">{form.errors[0]}</span>
			{/if}
		</form>
	</section>
	<section>
		<h3>Board</h3>
		<form
			class="board-form"
			method="POST"
			action="?/board"
			use:enhance={keepState}
			onchange={e => e.currentTarget.requestSubmit()}
		>
			<div class="columns">
				<div class="fields">
					<fieldset>
						<legend>Pieces</legend>
						<div class="pills">
							{#each PIECE_SETS as set}
								<label class="pill" class:selected={prefs.pieceSet === set}>
									<input type="radio" name="piece-set" value={set} bind:group={prefs.pieceSet} />
									{pieceLabels[set]}
								</label>
							{/each}
						</div>
					</fieldset>
					<fieldset>
						<legend>Board colors</legend>
						<div class="pills">
							{#each BOARD_THEMES as theme}
								<label class="pill" class:selected={prefs.boardTheme === theme}>
									<input type="radio" name="board-theme" value={theme} bind:group={prefs.boardTheme} />
									{themeLabels[theme]}
								</label>
							{/each}
						</div>
					</fieldset>
					<fieldset>
						<legend>Border</legend>
						<div class="pills">
							{#each BORDER_TYPES as border}
								<label class="pill" class:selected={prefs.borderType === border}>
									<input type="radio" name="border-type" value={border} bind:group={prefs.borderType} />
									{borderLabels[border]}
								</label>
							{/each}
						</div>
					</fieldset>
					<fieldset>
						<legend>Coordinates</legend>
						<div class="pills">
							{#each [true, false] as show}
								<label class="pill" class:selected={prefs.showCoordinates === show}>
									<input type="radio" name="show-coordinates" value={show} bind:group={prefs.showCoordinates} />
									{show ? "Show" : "Hide"}
								</label>
							{/each}
						</div>
						<p class="hint">With the frame border, coordinates sit in the border instead of on the squares.</p>
					</fieldset>
					<fieldset>
						<legend>Highlight last move</legend>
						<div class="pills">
							{#each [false, true] as every}
								<label class="pill" class:selected={prefs.highlightEveryMove === every}>
									<input type="radio" name="highlight-every-move" value={every} bind:group={prefs.highlightEveryMove} />
									{every ? "On every move" : "Where the board opens"}
								</label>
							{/each}
						</div>
					</fieldset>
					<fieldset>
						<legend>Piece animation</legend>
						<div class="pills">
							{#each ANIMATION_DURATIONS as duration}
								<!-- onfocus: keyboard navigation (tab / arrow keys) demos too -->
								<label class="pill" class:selected={prefs.animationDuration === duration} onclick={() => demoRequest++}>
									<input
										type="radio"
										name="animation-duration"
										value={duration}
										bind:group={prefs.animationDuration}
										onfocus={() => demoRequest++}
									/>
									{animationLabels[duration]}
								</label>
							{/each}
						</div>
					</fieldset>
					{#if form?.failed === "board"}
						<p class="error">{form.errors[0]}</p>
					{/if}
				</div>
				<div class="preview-board" class:black-border={hasBlackBorder(prefs)} bind:this={previewElement}></div>
			</div>
		</form>
	</section>
	<section>
		<h3 id="new-day">A new day starts at</h3>
		<p class="section-note">
			A card scheduled a day or more ahead, or a learning step that
			would end past this hour, waits for this hour rather than for the
			time of day you last saw it — so studying past midnight is still
			the same day's session instead of two days' cards at once.
			Learning steps that end before it keep their exact times. Pick an
			hour you are reliably asleep at.
		</p>
		<form
			method="POST"
			action="?/rollover"
			use:enhance={keepState}
			onchange={e => e.currentTarget.requestSubmit()}
		>
			<div class="pills" role="radiogroup" aria-labelledby="new-day">
				{#each ROLLOVER_HOURS as hour}
					<label class="pill" class:selected={rolloverHour === hour}>
						<input type="radio" name="rollover-hour" value={hour} bind:group={rolloverHour} />
						{hourLabel(hour)}
					</label>
				{/each}
			</div>
		</form>
		{#if form?.failed === "rollover"}
			<p class="error">{form.errors[0]}</p>
		{/if}
	</section>
	<section>
		<h3 id="desired-retention">Desired retention</h3>
		<p class="section-note">
			How likely you are to remember a card when it comes back. Higher means
			more reviews: 95% takes about 1.5–2× the reviews of 90%. A deck can have
			its own, in its Settings; the others use this one.
		</p>
		<form
			method="POST"
			action="?/retention"
			use:enhance={keepState}
			onchange={e => e.currentTarget.requestSubmit()}
		>
			<div class="pills" role="radiogroup" aria-labelledby="desired-retention">
				{#each RETENTIONS as retention}
					<label class="pill" class:selected={desiredRetention === retention}>
						<input type="radio" name="desired-retention" value={retention} bind:group={desiredRetention} />
						{Math.round(retention * 100)}%
					</label>
				{/each}
			</div>
		</form>
		{#if form?.failed === "retention"}
			<p class="error">{form.errors[0]}</p>
		{/if}
		<form method="POST" action="?/retentionEverywhere" use:enhance={keepState} class="follow-row">
			<button class="std-btn">Use for all decks</button>
			{#if form?.saved === "retentionEverywhere"}<span class="saved">Every deck uses this one now.</span>{/if}
		</form>
	</section>
	<section>
		<h3>Spaced repetition parameter optimization</h3>
		<p class="section-note">
			Spaced repetition algorithm parameters are automatically optimized
			{data.fsrs.refitDays} days after the previous optimization.
		</p>
		<p class="fit-status" aria-live="polite">{fitStatus(data.fsrs.last, data.fsrs.timeZone)}</p>
		<form method="POST" action="?/optimize" use:enhance={optimizeSubmit}>
			<button class="std-btn">{optimizing ? "Optimizing…" : "Optimize parameters"}</button>
		</form>
		{#if form?.failed === "optimize"}
			<p class="error">{form.errors[0]}</p>
		{/if}
	</section>
	{#if data.twoFactor.required}
		<TwoFactorSettings enabled={data.twoFactor.enabled} verified={data.twoFactor.verified} />
	{/if}
	<section>
		<h3>Account</h3>
		<button class="quiet-btn" onclick={logout}>Log out</button>
	</section>
	<section class="danger-zone">
		<h3>Danger zone</h3>
		{#if deleteRequested}
			<p class="delete-note">Check your email for a link to confirm the deletion.</p>
		{:else}
			<button class="danger-btn" onclick={requestDelete}>Delete account</button>
		{/if}
	</section>
</div>

<style>
	.container {
		margin-top: 34px;
		margin-bottom: 80px;
		padding: 24px 28px;
	}
	/* as the deck's Settings: a heading per topic, a line between; the
	   two-factor section is its component's */
	.container > :global(section) {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 8px;
		padding: 18px 0;
	}
	.container > :global(section + section) {
		border-top: 1px solid rgba(0, 0, 0, 0.1);
	}
	.container > :global(section:first-child) {
		padding-top: 0;
	}
	.container > :global(section:last-child) {
		padding-bottom: 0;
	}
	.container :global(section > h3) {
		margin: 0;
		font-size: 1.05rem;
		color: black;
	}
	h3 label {
		cursor: inherit;
	}
	.section-note {
		margin: 0;
		max-width: 75ch;
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.6);
	}
	.board-form {
		align-self: stretch;
	}
	.name-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.name-row input {
		border: 1px solid lightgrey;
		border-bottom: 1px solid darkgrey;
		border-radius: 4px;
		padding: 6px 8px;
		width: 260px;
	}
	.columns {
		display: flex;
		gap: 32px;
	}
	.fields {
		flex: 1 1 0;
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-width: 0;
	}
	fieldset {
		border: none;
		padding: 0;
		margin: 0;
	}
	/* group labels start where the first pill's left rounding ends, so the
	   label text lines up with the pills' visual body */
	legend {
		padding: 0;
		margin-bottom: 6px;
		margin-left: 6px;
		font-size: 0.95rem;
		color: rgba(0, 0, 0, 0.75);
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.pill {
		border: 1px solid rgba(0, 0, 0, 0.25);
		border-radius: 16px;
		padding: 4px 12px;
		cursor: pointer;
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.75);
	}
	.pill:hover {
		background-color: gainsboro;
	}
	.pill.selected {
		background-color: var(--accent);
		border-color: var(--accent);
		color: var(--accent-text);
	}
	/* the radio itself is visually hidden; keyboard focus shows on the pill */
	.pill input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}
	.pill:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.hint {
		margin: 6px 0 0 6px;
		font-size: 0.8rem;
		color: rgba(0, 0, 0, 0.55);
	}
	/* top flush with the Pieces legend across from it */
	.preview-board {
		flex: 0 0 340px;
		align-self: start;
		box-sizing: content-box;
	}
	.preview-board.black-border {
		border: 2px solid #404040;
		border-radius: 2px;
	}
	.follow-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.fit-status {
		margin: 0;
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.75);
	}
	.saved {
		color: var(--accent);
		font-size: 0.9rem;
	}
	.error {
		color: #c00;
		font-size: 0.9rem;
		margin: 0;
	}
	.danger-btn {
		padding: 7px 16px;
		border-radius: 5px;
		background-color: transparent;
		border: 1px solid #c62828;
		color: #c62828;
		cursor: pointer;
	}
	.danger-btn:hover {
		background-color: #c62828;
		color: white;
	}
	.delete-note {
		margin: 0;
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.65);
	}
	.quiet-btn {
		padding: 7px 16px;
		border-radius: 5px;
		background-color: transparent;
		border: 1px solid rgba(0, 0, 0, 0.25);
		color: rgba(0, 0, 0, 0.7);
		cursor: pointer;
	}
	.quiet-btn:hover {
		border-color: rgba(0, 0, 0, 0.5);
		color: black;
	}
	@media (max-width: 800px) {
		.columns {
			flex-direction: column;
		}
	}
</style>
