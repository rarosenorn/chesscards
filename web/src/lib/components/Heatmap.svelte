<script>
	import { heatmapWeeks, monthLabels, sayDay, streaks } from "$lib/heatmap.js"

	// The year's study, a square a day (see lib/heatmap.js).
	// days: every day anything was answered, each { day, count }.
	// today: the study day it is now.
	let { days, today } = $props();

	let weeks = $derived(heatmapWeeks(days, today));
	let months = $derived(monthLabels(weeks));
	let summary = $derived(streaks(days, today));

	const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
</script>

<div class="heatmap">
	<!-- the months, the weekdays and the squares keep to each other; the
	     block of them is what is centred -->
	<div class="chart">
	<div class="months" aria-hidden="true">
		{#each months as month}
			<span>{month}</span>
		{/each}
	</div>
	<div class="body">
		<div class="weekdays" aria-hidden="true">
			<span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
		</div>
		<!-- the app's own tooltip says each day's date and count -->
		<div class="weeks">
			{#each weeks as week}
				{#each week as cell}
					{#if cell}
						<span
							class="day level-{cell.level}"
							data-tip="{cell.count ? plural(cell.count, "review") : "No reviews"} on {sayDay(cell.day)}"
						></span>
					{:else}
						<span></span>
					{/if}
				{/each}
			{/each}
		</div>
	</div>
	</div>
	<p class="summary">
		{plural(summary.total, "review")} in the last year
		· current streak {plural(summary.current, "day")}
		· longest {plural(summary.longest, "day")}
	</p>
</div>

<style>
	.heatmap {
		--cell: 11px;
		--gap: 3px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		font-size: 0.75rem;
		color: rgba(0, 0, 0, 0.55);
	}
	.chart {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 4px;
	}
	/* the months stand over their columns: the same tracks as the weeks,
	   set in from the weekday names */
	.months {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: var(--cell);
		gap: var(--gap);
		margin-left: 18px;
		height: 14px;
	}
	.months span {
		white-space: nowrap;
	}
	.body {
		display: flex;
		gap: 6px;
	}
	.weekdays,
	.weeks {
		display: grid;
		grid-template-rows: repeat(7, var(--cell));
		gap: var(--gap);
	}
	.weekdays {
		width: 12px;
		line-height: var(--cell);
		font-size: 0.65rem;
		text-align: center;
	}
	/* a week is a column: the days run down it, then on to the next */
	.weeks {
		grid-auto-flow: column;
		grid-auto-columns: var(--cell);
	}
	.day {
		background-color: rgba(0, 0, 0, 0.07);
	}
	/* the greens of Anki's review heatmap, light to dark */
	.day.level-1 {
		background-color: #dae289;
	}
	.day.level-2 {
		background-color: #9cc069;
	}
	.day.level-3 {
		background-color: #669d45;
	}
	.day.level-4 {
		background-color: #3b6427;
	}
	.summary {
		margin: 6px 0 0;
		font-size: 0.85rem;
	}
</style>
