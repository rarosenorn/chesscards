<script>
	// The design tryout room: accent schemes and wordmark fonts, each applied
	// live to the whole app (see design-preview.js — the root layout re-applies
	// a stored choice on every page) until reset here.
	import { onMount } from "svelte"
	import { SCHEME_KEY, FONT_KEY, readPreview, applySchemeVars, clearSchemeVars, ensureFontStylesheet, applyFontVar, clearFontVar } from "$lib/design-preview.js"

	// "straight" — the hue at close to full strength; "muted" — the same idea
	// pulled toward grey
	const schemeGroups = [
		{
			title: "Straight",
			schemes: [
				{ name: "Current blue", accent: "#3381ca", hover: "#2b6dab", subtle: "#ebf3fa", strong: "#d4e5f5" },
				{ name: "Royal blue", accent: "#2b6be6", hover: "#2258c4", subtle: "#ecf2fd", strong: "#d3e1fb" },
				{ name: "Emerald", accent: "#18a34b", hover: "#148a3f", subtle: "#e9f7ee", strong: "#cdeeda" },
				{ name: "Teal", accent: "#0f9b8e", hover: "#0c8177", subtle: "#e8f7f5", strong: "#cdeeea" },
				{ name: "Purple", accent: "#7b3ff2", hover: "#6733cf", subtle: "#f3eefe", strong: "#e3d7fc" },
				{ name: "Crimson", accent: "#d92643", hover: "#b81f38", subtle: "#fdeef0", strong: "#f9d4da" },
				{ name: "Orange", accent: "#e86412", hover: "#c5540f", subtle: "#fdf1e8", strong: "#fadcc6" }
			]
		},
		{
			title: "Muted",
			schemes: [
				{ name: "Forest green", accent: "#4a7c59", hover: "#3e6a4b", subtle: "#edf4ee", strong: "#d5e6da" },
				{ name: "Ink navy", accent: "#3f5878", hover: "#344a66", subtle: "#eef2f6", strong: "#d9e2ec" },
				{ name: "Walnut", accent: "#8a6134", hover: "#75522c", subtle: "#f6f1ea", strong: "#eadfcd" },
				{ name: "Dusty teal", accent: "#3d7676", hover: "#326262", subtle: "#ecf4f4", strong: "#d3e6e6" },
				{ name: "Heather plum", accent: "#6d5f86", hover: "#5c5072", subtle: "#f1eff5", strong: "#e0dcea" }
			]
		}
	];

	const fonts = [
		{ family: "Space Mono", note: "quirky, made for display" },
		{ family: "JetBrains Mono", note: "clean, techy" },
		{ family: "IBM Plex Mono", note: "typewriter neutral" },
		{ family: "Fira Mono", note: "humanist, soft" },
		{ family: "Red Hat Mono", note: "rounded, friendly" },
		{ family: "Victor Mono", note: "narrow, elegant" }
	];

	let activeAccent = $state(null);
	let activeFont = $state(null);

	onMount(() => {
		activeAccent = readPreview(SCHEME_KEY)?.accent ?? null;
		activeFont = readPreview(FONT_KEY)?.family ?? null;
		// the samples below render in the tryout fonts, so they must load here
		// even before any is applied
		ensureFontStylesheet();
	});

	const applyScheme = scheme => {
		applySchemeVars(scheme);
		localStorage.setItem(SCHEME_KEY, JSON.stringify(scheme));
		activeAccent = scheme.accent;
	}

	const resetScheme = () => {
		clearSchemeVars();
		localStorage.removeItem(SCHEME_KEY);
		activeAccent = null;
	}

	const applyFont = font => {
		applyFontVar(font.family);
		localStorage.setItem(FONT_KEY, JSON.stringify(font));
		activeFont = font.family;
	}

	const resetFont = () => {
		clearFontVar();
		localStorage.removeItem(FONT_KEY);
		activeFont = null;
	}
</script>

<div class="design-container">
	<p class="intro">
		Applying a color or font takes over the whole app while you browse —
		flip through Study and Browse to see it live. It sticks until reset
		here; making a choice permanent is a code change.
	</p>

	<section>
		<h3>Accent color</h3>
		{#each schemeGroups as group (group.title)}
			<h4>{group.title}</h4>
			<div class="scheme-grid">
				{#each group.schemes as scheme (scheme.accent)}
					<button
						class="scheme-card"
						class:applied={activeAccent === scheme.accent}
						onclick={() => applyScheme(scheme)}
					>
						<!-- the banner, a selected table row, a subtle fill and the two
						     solids: the places the accent actually shows up, in miniature -->
						<span class="mini-banner" style="background-color: {scheme.accent}">Chesscards</span>
						<span class="mini-row" style="background-color: {scheme.strong}">selected row</span>
						<span class="mini-row" style="background-color: {scheme.subtle}">subtle fill</span>
						<span class="swatches">
							<span class="swatch" style="background-color: {scheme.accent}"></span>
							<span class="swatch" style="background-color: {scheme.hover}"></span>
							<span class="swatch" style="background-color: {scheme.strong}"></span>
							<span class="swatch" style="background-color: {scheme.subtle}"></span>
						</span>
						<span class="card-name">
							{scheme.name}
							<span class="card-note">{scheme.accent}</span>
						</span>
					</button>
				{/each}
			</div>
		{/each}
		<button class="std-btn reset-btn" onclick={resetScheme}>Reset color to app default</button>
	</section>

	<section>
		<h3>Wordmark font</h3>
		<div class="scheme-grid">
			{#each fonts as font (font.family)}
				<button
					class="scheme-card"
					class:applied={activeFont === font.family}
					onclick={() => applyFont(font)}
				>
					<span class="mini-banner font-banner" style="font-family: '{font.family}'">Chesscards</span>
					<span class="card-name">
						{font.family}
						<span class="card-note">{font.note}</span>
					</span>
				</button>
			{/each}
		</div>
		<button class="std-btn reset-btn" onclick={resetFont}>Reset font to app default</button>
	</section>
</div>

<style>
	.design-container {
		display: flex;
		flex-direction: column;
		padding: 25px;
	}
	.intro {
		margin: 0 0 18px 0;
		font-size: 0.95rem;
		color: rgba(0, 0, 0, 0.6);
	}
	section + section {
		margin-top: 28px;
		padding-top: 18px;
		border-top: 1px solid rgba(0, 0, 0, 0.1);
	}
	h3 {
		margin: 0 0 10px 0;
		font-size: 1.05rem;
	}
	h4 {
		margin: 12px 0 8px 0;
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(0, 0, 0, 0.5);
	}
	.scheme-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 14px;
	}
	.scheme-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px;
		border: 1px solid #ddd;
		border-radius: 6px;
		background-color: white;
		text-align: left;
		cursor: pointer;
	}
	.scheme-card:hover {
		border-color: #999;
	}
	/* the applied card wears the accent as its mark */
	.scheme-card.applied {
		border-color: var(--accent);
		outline: 1px solid var(--accent);
	}
	.mini-banner {
		display: block;
		padding: 8px 10px;
		border-radius: 3px;
		color: white;
		font-family: var(--wordmark-font, roboto-mono);
		font-size: 1rem;
	}
	/* font samples wear whatever accent is applied, so the two choices can
	   be judged together */
	.font-banner {
		background-color: var(--accent);
		font-size: 1.35rem;
	}
	.mini-row {
		display: block;
		padding: 3px 10px;
		border-radius: 3px;
		font-size: 0.8rem;
		color: #333;
	}
	.swatches {
		display: flex;
		gap: 4px;
	}
	.swatch {
		width: 22px;
		height: 22px;
		border-radius: 3px;
		border: 1px solid rgba(0, 0, 0, 0.08);
	}
	.card-name {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.card-note {
		font-weight: 400;
		font-size: 0.8rem;
		color: rgba(0, 0, 0, 0.5);
		white-space: nowrap;
	}
	.reset-btn {
		align-self: start;
		margin-top: 14px;
	}
	@media (max-width: 800px) {
		.scheme-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
