<script>
	// The Basic/Tactic pills of the card editors (add cards, study's edit),
	// each with a tooltip on how the type is scheduled
	let { value, onchoose, labelledby } = $props();

	const types = [
		["basic", "Basic", "Basic card type: Card is scheduled following FSRS (Free Spaced Repetition Scheduler)"],
		["tactic", "Tactic", "Tactic card type: Card has fixed intervals of default 14, 60 and 180 days if solved. If incorrect the card resets."]
	];
</script>

<div class="type-segments" role="radiogroup" aria-labelledby={labelledby}>
	{#each types as [type, label, description]}
		<button
			class="std-btn"
			role="radio"
			aria-checked={value === type}
			class:selected={value === type}
			onclick={() => onchoose(type)}
		>
			{label}
			<span class="tooltip" aria-hidden="true">{@html description}</span>
		</button>
	{/each}
</div>

<style>
	.type-segments {
		display: flex;
		gap: 4px;
	}
	/* unselected recedes grey, the selected pill is plain white — the
	   contrast alone carries the state, no accent border */
	.type-segments button {
		width: 62px;
		padding: 3px 0;
		border-radius: 999px;
		font-size: 0.85rem;
		cursor: pointer;
		position: relative;
		margin: 0;
		background-color: #e6e6e6;
		color: rgba(0, 0, 0, 0.65);
	}
	/* custom tooltip: appears after 300ms instead of the ~1s native delay
	   (a real element rather than a title attribute, so it can hold markup) */
	.type-segments button .tooltip {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		width: max-content;
		max-width: 300px;
		text-align: left;
		background-color: black;
		color: white;
		font-size: 13px;
		font-weight: 500;
		padding: 5px 10px;
		border-radius: 4px;
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		transition: opacity 100ms ease 300ms, visibility 0ms 300ms;
		/* above the sticky menu-bar holder, which the tooltip hangs over */
		z-index: 30;
	}
	.type-segments button:hover .tooltip {
		opacity: 1;
		visibility: visible;
	}
	.type-segments button.selected {
		background-color: white;
		color: black;
	}
	/* the :active transform makes the button a stacking context, which would
	   trap the tooltip beneath the card below — lift the button while the
	   tooltip can be showing */
	.type-segments button:hover,
	.type-segments button:active {
		z-index: 30;
	}
</style>
