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
			title: "Ink — quiet deeps like the navy",
			schemes: [
				{ name: "Ink navy", accent: "#3f5878", hover: "#344a66", subtle: "#eef2f6", strong: "#d9e2ec" },
				{ name: "Storm", accent: "#4f6d8f", hover: "#425c7a", subtle: "#eff3f7", strong: "#d9e2ed" },
				{ name: "Slate", accent: "#52606d", hover: "#434f5a", subtle: "#eff2f4", strong: "#dbe2e7" },
				{ name: "Ink teal", accent: "#3e6360", hover: "#32514e", subtle: "#ecf2f1", strong: "#d3e2e0" },
				{ name: "Ink green", accent: "#4d6a56", hover: "#3f5847", subtle: "#eef3ef", strong: "#d7e4da" },
				{ name: "Ink purple", accent: "#575074", hover: "#48425f", subtle: "#f0eff4", strong: "#dcdae6" },
				{ name: "Ink wine", accent: "#6e4a56", hover: "#5b3d47", subtle: "#f4eff0", strong: "#e5d9dc" },
				{ name: "Graphite", accent: "#50525b", hover: "#42444c", subtle: "#f0f0f2", strong: "#dcdde1" }
			]
		},
		{
			title: "Jewel — rich hues that carry white text",
			schemes: [
				{ name: "Deep emerald", accent: "#047857", hover: "#036649", subtle: "#e6f4f0", strong: "#c6e7dd" },
				{ name: "Racing green", accent: "#166534", hover: "#115229", subtle: "#e8f3ec", strong: "#cbe5d3" },
				{ name: "Pine", accent: "#115e59", hover: "#0d4b47", subtle: "#e7f2f1", strong: "#c9e3e1" },
				{ name: "Petrol", accent: "#0e7490", hover: "#0b5f77", subtle: "#e7f3f6", strong: "#c9e4ec" },
				{ name: "Sapphire", accent: "#0369a1", hover: "#02537f", subtle: "#e6f2f8", strong: "#c5e2f0" },
				{ name: "Midnight indigo", accent: "#312e81", hover: "#27256a", subtle: "#eeeef7", strong: "#d6d5ea" },
				{ name: "Royal purple", accent: "#6d28d9", hover: "#5b21b6", subtle: "#f2ecfd", strong: "#e0d3f9" },
				{ name: "Grape", accent: "#7e22ce", hover: "#6b1cb0", subtle: "#f4ecfc", strong: "#e4d2f7" },
				{ name: "Fuchsia", accent: "#a21caf", hover: "#86178f", subtle: "#f9edfa", strong: "#eed2f0" },
				{ name: "Deep rose", accent: "#be185d", hover: "#9d174d", subtle: "#fcecf3", strong: "#f5cfe0" },
				{ name: "Wine", accent: "#9f1239", hover: "#881337", subtle: "#fbecf1", strong: "#f3cfdb" },
				{ name: "Ruby", accent: "#b91c1c", hover: "#9b1717", subtle: "#fbeeee", strong: "#f4d2d2" },
				{ name: "Burnt orange", accent: "#c2410c", hover: "#a3360a", subtle: "#fcefe7", strong: "#f6d6c2" },
				{ name: "Copper", accent: "#b45309", hover: "#954507", subtle: "#f9f1e7", strong: "#f0dcc2" }
			]
		},
		{
			title: "Straight",
			schemes: [
				{ name: "Current blue", accent: "#3381ca", hover: "#2b6dab", subtle: "#ebf3fa", strong: "#d4e5f5" },
				{ name: "Royal blue", accent: "#2b6be6", hover: "#2258c4", subtle: "#ecf2fd", strong: "#d3e1fb" },
				{ name: "Cobalt", accent: "#1d4ed8", hover: "#1841b4", subtle: "#eaeffc", strong: "#cfdbf9" },
				{ name: "Ultramarine", accent: "#4338ca", hover: "#3730a3", subtle: "#efeefb", strong: "#dcd9f5" },
				{ name: "Navy cobalt", accent: "#1e3a8a", hover: "#172d6e", subtle: "#eaeef8", strong: "#d0d9ee" },
				{ name: "Indigo", accent: "#4f46e5", hover: "#423bc2", subtle: "#efeefd", strong: "#dcdafa" },
				{ name: "Azure", accent: "#0284c7", hover: "#026da5", subtle: "#e7f4fb", strong: "#c8e6f5" },
				{ name: "Emerald", accent: "#18a34b", hover: "#148a3f", subtle: "#e9f7ee", strong: "#cdeeda" },
				{ name: "Teal", accent: "#0f9b8e", hover: "#0c8177", subtle: "#e8f7f5", strong: "#cdeeea" },
				{ name: "Purple", accent: "#7b3ff2", hover: "#6733cf", subtle: "#f3eefe", strong: "#e3d7fc" },
				{ name: "Crimson", accent: "#d92643", hover: "#b81f38", subtle: "#fdeef0", strong: "#f9d4da" },
				{ name: "Orange", accent: "#e86412", hover: "#c5540f", subtle: "#fdf1e8", strong: "#fadcc6" }
			]
		},
		{
			title: "Light — dark text on the accent",
			schemes: [
				{ name: "Sunshine", accent: "#fad718", hover: "#e3c214", subtle: "#fdfae4", strong: "#faf0b0", text: "#1a1a1a" },
				{ name: "Amber", accent: "#fbbf24", hover: "#eaa908", subtle: "#fef6e3", strong: "#fce8b3", text: "#1a1a1a" },
				{ name: "Tangerine", accent: "#fb923c", hover: "#ee7d1f", subtle: "#fef3e9", strong: "#fdddc2", text: "#1a1a1a" },
				{ name: "Lime", accent: "#a3e635", hover: "#8fd41e", subtle: "#f6fce8", strong: "#e5f7c0", text: "#1a1a1a" },
				{ name: "Mint", accent: "#4ade80", hover: "#2fc767", subtle: "#ecfbf2", strong: "#c9f2da", text: "#1a1a1a" },
				{ name: "Sky", accent: "#38bdf8", hover: "#1baaef", subtle: "#eaf8fe", strong: "#c5ecfc", text: "#1a1a1a" },
				{ name: "Coral", accent: "#fb7185", hover: "#f4506a", subtle: "#fef0f2", strong: "#fdd3da", text: "#1a1a1a" }
			]
		},
		{
			title: "Muted",
			schemes: [
				{ name: "Forest green", accent: "#4a7c59", hover: "#3e6a4b", subtle: "#edf4ee", strong: "#d5e6da" },
				{ name: "Walnut", accent: "#8a6134", hover: "#75522c", subtle: "#f6f1ea", strong: "#eadfcd" },
				{ name: "Dusty teal", accent: "#3d7676", hover: "#326262", subtle: "#ecf4f4", strong: "#d3e6e6" },
				{ name: "Heather plum", accent: "#6d5f86", hover: "#5c5072", subtle: "#f1eff5", strong: "#e0dcea" }
			]
		}
	];

	const fontGroups = [
		{
			title: "Sturdy — real 500/600 cuts",
			fonts: [
				{ family: "Space Grotesk", note: "Space Mono's proportional sibling" },
				{ family: "Manrope", note: "solid, modern" },
				{ family: "Outfit", note: "geometric, even" },
				{ family: "Sora", note: "wide, technical" },
				{ family: "Lexend", note: "broad, heavy presence" },
				{ family: "Plus Jakarta Sans", note: "rounded sturdy" },
				{ family: "Barlow", note: "grotesque, workmanlike" }
			]
		},
		{
			title: "Sans",
			fonts: [
				{ family: "Montserrat", note: "geometric, confident" },
				{ family: "Poppins", note: "round geometric, friendly" },
				{ family: "Inter", note: "the app's body font" },
				{ family: "Lato", note: "warm, classic web" },
				{ family: "Nunito", note: "soft, rounded" },
				{ family: "Raleway", note: "elegant, thin" },
				{ family: "Rubik", note: "sturdy, slightly rounded" },
				{ family: "DM Sans", note: "clean, modern" }
			]
		},
		{
			title: "Serif / display",
			fonts: [
				{ family: "Playfair Display", note: "high-contrast, editorial" },
				{ family: "Lora", note: "calm bookish serif" },
				{ family: "Merriweather", note: "sturdy reading serif" }
			]
		},
		{
			title: "Mono",
			fonts: [
				{ family: "Space Mono", note: "quirky, made for display" },
				{ family: "JetBrains Mono", note: "clean, techy" },
				{ family: "IBM Plex Mono", note: "typewriter neutral" },
				{ family: "Fira Mono", note: "humanist, soft" },
				{ family: "Red Hat Mono", note: "rounded, friendly" },
				{ family: "Victor Mono", note: "narrow, elegant" }
			]
		}
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
						<span class="mini-banner" style="background-color: {scheme.accent}; color: {scheme.text ?? 'white'}">Chesscards</span>
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
		<h3>Banner font</h3>
		{#each fontGroups as group (group.title)}
			<h4>{group.title}</h4>
			<div class="scheme-grid">
				{#each group.fonts as font (font.family)}
					<button
						class="scheme-card"
						class:applied={activeFont === font.family}
						onclick={() => applyFont(font)}
					>
						<span class="mini-banner font-banner" style="font-family: '{font.family}'">Chesscards <span class="font-menu-sample">My flashcards</span></span>
						<span class="card-name">
							{font.family}
							<span class="card-note">{font.note}</span>
						</span>
					</button>
				{/each}
			</div>
		{/each}
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
	   be judged together; the small menu sample shows the same family at
	   nav-link size */
	.font-banner {
		background-color: var(--accent);
		color: var(--accent-text);
		font-size: 1.35rem;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}
	.font-menu-sample {
		font-size: 0.85rem;
		/* the weight the real menu wears, so the sample tells the truth about
		   families lacking a 500 cut */
		font-weight: 500;
		color: color-mix(in srgb, var(--accent-text) 85%, transparent);
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
