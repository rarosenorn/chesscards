<script>
	// A tryout room for the app's accent: each card is a candidate scheme,
	// applying one overrides the accent vars on :root and stores the choice,
	// so the whole app wears it while browsing (the root layout re-applies it
	// on every load) until it is reset here. Nothing touches app.css — making
	// a scheme permanent stays a code change.
	const STORAGE_KEY = "chesscards:scheme-preview";

	const schemes = [
		{ name: "Current blue", accent: "#3381ca", hover: "#2b6dab", subtle: "#ebf3fa", strong: "#d4e5f5" },
		{ name: "Forest green", accent: "#4a7c59", hover: "#3e6a4b", subtle: "#edf4ee", strong: "#d5e6da" },
		{ name: "Ink navy", accent: "#3f5878", hover: "#344a66", subtle: "#eef2f6", strong: "#d9e2ec" },
		{ name: "Walnut", accent: "#8a6134", hover: "#75522c", subtle: "#f6f1ea", strong: "#eadfcd" },
		{ name: "Dusty teal", accent: "#3d7676", hover: "#326262", subtle: "#ecf4f4", strong: "#d3e6e6" },
		{ name: "Heather plum", accent: "#6d5f86", hover: "#5c5072", subtle: "#f1eff5", strong: "#e0dcea" }
	];

	let activeAccent = $state(null);
	try {
		activeAccent = JSON.parse(localStorage.getItem(STORAGE_KEY))?.accent ?? null;
	} catch {
		// no stored preview
	}

	const apply = scheme => {
		const root = document.documentElement.style;
		root.setProperty("--accent", scheme.accent);
		root.setProperty("--accent-hover", scheme.hover);
		root.setProperty("--accent-subtle", scheme.subtle);
		root.setProperty("--accent-subtle-strong", scheme.strong);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(scheme));
		activeAccent = scheme.accent;
	}

	// back to app.css's own values: the inline overrides go, nothing stays stored
	const reset = () => {
		const root = document.documentElement.style;
		for (const name of ["--accent", "--accent-hover", "--accent-subtle", "--accent-subtle-strong"]) {
			root.removeProperty(name);
		}
		localStorage.removeItem(STORAGE_KEY);
		activeAccent = null;
	}
</script>

<div class="schemes-container">
	<p class="intro">
		Applying a scheme recolors the whole app while you browse — flip through
		Study and Browse to see it live. It sticks until you reset it here;
		making one permanent is a code change.
	</p>

	<div class="scheme-grid">
		{#each schemes as scheme (scheme.accent)}
			<button
				class="scheme-card"
				class:applied={activeAccent === scheme.accent}
				onclick={() => apply(scheme)}
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
				<span class="scheme-name">
					{scheme.name}
					<span class="scheme-hex">{scheme.accent}</span>
				</span>
			</button>
		{/each}
	</div>

	<div class="actions">
		<button class="std-btn" onclick={reset}>Reset to app default</button>
	</div>
</div>

<style>
	.schemes-container {
		display: flex;
		flex-direction: column;
		padding: 25px;
	}
	.intro {
		margin: 0 0 18px 0;
		font-size: 0.95rem;
		color: rgba(0, 0, 0, 0.6);
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
	/* the applied card wears its own accent as the mark */
	.scheme-card.applied {
		border-color: var(--accent);
		outline: 1px solid var(--accent);
	}
	.mini-banner {
		display: block;
		padding: 8px 10px;
		border-radius: 3px;
		color: white;
		font-family: roboto-mono;
		font-size: 1rem;
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
	.scheme-name {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-size: 0.9rem;
		font-weight: 600;
	}
	.scheme-hex {
		font-weight: 400;
		font-size: 0.8rem;
		color: rgba(0, 0, 0, 0.5);
	}
	.actions {
		margin-top: 18px;
	}
	@media (max-width: 800px) {
		.scheme-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
