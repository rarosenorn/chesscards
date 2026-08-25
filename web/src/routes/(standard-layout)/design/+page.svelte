<script>
	// The design tryout room: accent schemes and wordmark fonts, each applied
	// live to the whole app (see design-preview.js — the root layout re-applies
	// a stored choice on every page) until reset here.
	import { onMount } from "svelte"
	import { SCHEME_KEY, FONT_KEY, BANNER_KEY, readPreview, applySchemeVars, clearSchemeVars, ensureFontStylesheet, applyFontVar, clearFontVar, applyBannerVariant, clearBannerVariant } from "$lib/design-preview.js"
	import FlashcardBrowse from "$lib/components/FlashcardBrowse.svelte"

	// "straight" — the hue at close to full strength; "muted" — the same idea
	// pulled toward grey
	const schemeGroups = [
		{
			title: "Ink navy, pulled bluer and lighter",
			schemes: [
				{ name: "Ink blue", accent: "#44608c", hover: "#38507a", subtle: "#eef2f7", strong: "#d8e1ee" },
				{ name: "Denim ink", accent: "#4a6ba0", hover: "#3d5a89", subtle: "#eff3f9", strong: "#d9e2f1" },
				{ name: "Denim +1", accent: "#4e70a7", hover: "#415e8e", subtle: "#eff3f9", strong: "#dae3f2" },
				{ name: "Denim +2", accent: "#5274ab", hover: "#456293", subtle: "#f0f4fa", strong: "#dbe4f3" },
				{ name: "Denim +3", accent: "#5678b0", hover: "#496698", subtle: "#f0f4fa", strong: "#dce5f4" },
				{ name: "Denim sat +1", accent: "#4169aa", hover: "#365a92", subtle: "#eef3f9", strong: "#d7e2f2" },
				{ name: "Denim sat +2", accent: "#3867b2", hover: "#2f5798", subtle: "#edf2fa", strong: "#d4e1f4" },
				{ name: "Denim sat +3", accent: "#2f65bc", hover: "#27559f", subtle: "#ecf2fb", strong: "#d2e0f6" },
				{ name: "Steel blue", accent: "#527ab3", hover: "#45689b", subtle: "#f0f4fa", strong: "#dbe5f4" },
				{ name: "Royal navy", accent: "#002366", hover: "#001b4d", subtle: "#e8ecf5", strong: "#c9d3ea" }
			]
		},
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
				{ name: "Steelblue (current)", accent: "#4682b4", hover: "#3b6e99", subtle: "#f0f5f9", strong: "#dae6f0" },
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

	// The card tab: one sample card rendered once per variant, so the ways at
	// the long-measure problem can be read side by side rather than described.
	// Each variant is only the vars it changes; anything it leaves out is
	// app.css's own value, which is what the first one shows.
	const CARD_DEFAULTS = { width: 880, size: 16.2, measure: 79 };

	const cardVariants = [
		{
			name: "As it is now",
			note: "16.2px, 1.5 leading, a 79ch column, centred"
		},
		{
			name: "Narrower column",
			note: "60ch — the middle of the comfortable range",
			vars: { measure: 60 }
		},
		{
			name: "Narrower still",
			note: "68ch — where this sat before",
			vars: { measure: 68 }
		},
		{
			name: "Column centred",
			note: "the same column, centred in the card instead of sharing an edge",
			vars: { align: "center" }
		},
		{
			name: "Full width, open leading",
			note: "no column at all — the whole card's width at 1.6 leading",
			vars: { measure: 999, leading: "1.6" }
		},
		{
			name: "Two columns over a board pair",
			note: "justified and hyphenated over the boards' own 20px gutter, the way a paper sets them — balanced, so a short paragraph makes two short columns rather than filling the left one first",
			vars: { columns: true }
		},
		{
			name: "What it was before",
			note: "17px, 32px a side, default leading — the long line with tight leading",
			vars: { size: 17, measure: 999, leading: "normal" }
		}
	];

	// the arithmetic under each variant: the card less its 32px rims, less the
	// inset; characters from Inter's average advance of about 0.47em
	const variantStyle = vars => [
		vars?.width && `--flashcard-width: ${vars.width}px`,
		vars?.size && `--card-text-size: ${vars.size}px`,
		vars?.measure && `--card-text-measure: ${vars.measure}ch`,
		vars?.leading && `--card-text-leading: ${vars.leading}`
	].filter(Boolean).join("; ");

	// a ch column is its own character count, until it outruns the card and the
	// card's own width takes over
	const variantChars = vars => {
		const size = vars?.size ?? CARD_DEFAULTS.size;
		let cardWidth = (vars?.width ?? CARD_DEFAULTS.width) - 64;
		if (vars?.columns) return Math.round((cardWidth - 20) / 2 / (size * 0.47));
		return Math.round(Math.min(vars?.measure ?? CARD_DEFAULTS.measure, cardWidth / (size * 0.47)));
	}

	// a card with the shape the problem shows up on: a paragraph long enough to
	// wrap, over a pair of boards that hold the card at its full width
	const sampleText = paragraph => ({
		type: "text",
		content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: paragraph }] }] }
	});

	const sampleCard = {
		front: [
			sampleText("In Anastasia's mate, a king is on the edge of the board. It has a friendly pawn or rook blocking its flight square orthogonally towards the center. An opponent knight is 3 squares from the king in the same direction, controlling the kings 2 diagonal flight squares."),
			{
				type: "chessboards",
				content: [
					{ fen: "r4rk1/ppp2ppp/2bp4/3Nn3/4P3/3B3R/PPP2qPP/R2Q3K w - - 2 18", moves: [], annotations: {}, orientation: "w" },
					{ fen: "5r2/5Nqp/p5k1/1p6/2p5/P1P5/1P3PPP/5RK1 w - - 0 1", moves: [], annotations: {}, orientation: "w" }
				]
			}
		],
		back: []
	};

	let activeAccent = $state(null);
	let activeFont = $state(null);
	let whiteBanner = $state(false);
	let tab = $state("color");

	onMount(() => {
		activeAccent = readPreview(SCHEME_KEY)?.accent ?? null;
		activeFont = readPreview(FONT_KEY)?.family ?? null;
		whiteBanner = readPreview(BANNER_KEY)?.variant === "white";
		// the samples below render in the tryout fonts, so they must load here
		// even before any is applied
		ensureFontStylesheet();
	});

	// clicking the applied card again deselects it, back to the app default
	const applyScheme = scheme => {
		if (activeAccent === scheme.accent) return resetScheme();
		applySchemeVars(scheme);
		localStorage.setItem(SCHEME_KEY, JSON.stringify(scheme));
		activeAccent = scheme.accent;
	}

	const resetScheme = () => {
		clearSchemeVars();
		localStorage.removeItem(SCHEME_KEY);
		activeAccent = null;
	}

	// on/off rather than pick-one: the banner variant rides on top of
	// whichever accent scheme is applied
	const toggleWhiteBanner = () => {
		whiteBanner = !whiteBanner;
		if (whiteBanner) {
			applyBannerVariant("white");
			localStorage.setItem(BANNER_KEY, JSON.stringify({ variant: "white" }));
		} else {
			clearBannerVariant();
			localStorage.removeItem(BANNER_KEY);
		}
	}

	const applyFont = font => {
		if (activeFont === font.family) return resetFont();
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

	<div class="tabs">
		<button class:current={tab === "color"} onclick={() => tab = "color"}>Accent color</button>
		<button class:current={tab === "font"} onclick={() => tab = "font"}>Menu font</button>
		<button class:current={tab === "card"} onclick={() => tab = "card"}>Card text</button>
	</div>

	{#if tab === "color"}
	<section>
		<h4>Banner — rides on top of any scheme below</h4>
		<div class="scheme-grid">
			<button
				class="scheme-card"
				class:applied={whiteBanner}
				onclick={toggleWhiteBanner}
			>
				<span class="mini-banner white-banner"><span class="mini-wordmark">Chesscards</span> <span class="white-banner-links">My flashcards</span></span>
				<span class="card-name">
					White banner
					<span class="card-note">click to toggle — accent stays for buttons</span>
				</span>
			</button>
		</div>
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
						<span class="mini-banner" style="background-color: {scheme.accent}; color: {scheme.text ?? 'white'}"><span class="mini-wordmark">Chesscards</span></span>
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
	{:else if tab === "font"}
	<section>
		{#each fontGroups as group (group.title)}
			<h4>{group.title}</h4>
			<div class="scheme-grid">
				{#each group.fonts as font (font.family)}
					<button
						class="scheme-card"
						class:applied={activeFont === font.family}
						onclick={() => applyFont(font)}
					>
						<span class="mini-banner font-banner"><span class="mini-wordmark">Chesscards</span> <span class="font-menu-sample" style="font-family: '{font.family}'">My flashcards</span></span>
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
	{:else}
	<section>
		<p class="lever-intro">
			The card is wide because the boards are, so its prose runs a long
			line whatever else is done. Each card below is the same text and the
			same two boards, with one way at that problem applied. Nothing here
			changes the app — picking one is a code change.
		</p>
		{#each cardVariants as variant (variant.name)}
			<h4>{variant.name}</h4>
			<p class="lever-note">
				{variant.note}
				<span class="measure-note">
					· about {variantChars(variant.vars)} characters a line
				</span>
			</p>
			<div
				class="variant"
				class:card-text-columns={variant.vars?.columns}
				class:card-text-centre={variant.vars?.align === "center"}
				style={variantStyle(variant.vars)}
			>
				<FlashcardBrowse card={sampleCard} />
			</div>
		{/each}
	</section>
	{/if}
</div>

<style>
	.lever-intro {
		margin: 0 0 14px 0;
		font-size: 0.95rem;
		color: rgba(0, 0, 0, 0.6);
	}
	.measure-note {
		color: rgba(0, 0, 0, 0.5);
	}
	.lever-note {
		margin: 0 0 8px 0;
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.55);
	}
	/* the cards sit on the page's grey the way they do in browse; the widest
	   variant decides the column, so the narrower ones read as narrower */
	.variant {
		display: flex;
		justify-content: center;
		margin-bottom: 28px;
	}
	/* the one variant that undoes the shared edge, to read it against */
	.variant.card-text-centre :global(.flashcard .card-side .text-block) {
		align-self: center;
	}
	/* only where the boards make a row to fill: a side of lone boards has no
	   width to match, so its text keeps the column */
	.variant.card-text-columns :global(.flashcard .card-side[data-board-align="left"] .text-block) {
		max-width: 100%;
		margin-inline-start: 0;
		columns: 2;
		/* the boards' own gap, so the two columns sit as close as the two
		   diagrams under them; a paper's gutter is about this share of the
		   measure too */
		column-gap: var(--board-col-gap);
		/* what makes a column read as a column rather than as a narrow
		   paragraph: both edges straight, with hyphenation to stop a
		   justified 54-character line opening rivers */
		text-align: justify;
		hyphens: auto;
	}
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
	/* the deck pages' tab look, minus the routes: these switch local state */
	.tabs {
		display: flex;
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
	}
	.tabs > button {
		background-color: white;
		border: 1px solid #e3e1e1;
		border-bottom: none;
		border-radius: 4px 4px 0 0;
		margin-right: 5px;
		padding: 6px 16px 3px 16px;
		cursor: pointer;
		font-size: 0.95rem;
	}
	.tabs > button:hover {
		background-color: rgba(0, 0, 0, 0.05);
	}
	.tabs > button.current {
		color: var(--accent-text);
		background-color: var(--accent);
	}
	section {
		margin-top: 4px;
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
	/* the applied card's mark stays the app's own blue: an outline in the
	   scheme being tried would vanish on the light ones */
	.scheme-card.applied {
		border-color: #4682b4;
		outline: 1px solid #4682b4;
	}
	.mini-banner {
		display: block;
		padding: 8px 10px;
		border-radius: 3px;
		color: white;
		font-size: 1rem;
	}
	/* the wordmark rendered as the real banner wears it (app face, bold) */
	.mini-wordmark {
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	/* font samples wear whatever accent is applied, so the two choices can
	   be judged together; the tryout family dresses the menu sample — the
	   wordmark keeps its own face, like the real banner */
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
		   families lacking a 600 cut */
		font-weight: 600;
		color: color-mix(in srgb, var(--accent-text) 85%, transparent);
	}
	/* the white-banner card's miniature: paper bar, hairline, accent wordmark */
	.white-banner {
		background-color: white;
		border: 1px solid #ddd;
		border-bottom: 1px solid rgba(0, 0, 0, 0.25);
		color: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}
	.white-banner-links {
		font-size: 0.85rem;
		font-weight: 600;
		font-family: var(--menu-font, inherit);
		color: rgba(0, 0, 0, 0.65);
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
