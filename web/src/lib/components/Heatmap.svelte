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
	<!-- the weekdays, the squares and the months keep to each other; the
	     block of them is what is centred -->
	<div class="chart">
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
								class:today={cell.today}
								data-tip="{cell.count ? plural(cell.count, "review") : "No reviews"} on {sayDay(cell.day)}"
							></span>
						{:else}
							<span></span>
						{/if}
					{/each}
				{/each}
			</div>
		</div>
		<div class="months" aria-hidden="true">
			{#each months as month}
				<span>{month}</span>
			{/each}
		</div>
	</div>
	<!-- each figure under its own name, the figure in the squares' green -->
	<p class="summary">
		<span>Reviews in the last year: <strong>{summary.total}</strong></span>
		<span>Current streak: <strong>{plural(summary.current, "day")}</strong></span>
		<span>Longest streak: <strong>{plural(summary.longest, "day")}</strong></span>
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
		gap: 5px;
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
	/* the months stand under their columns: the same tracks as the weeks,
	   set in from the weekday letters */
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
	.day {
		background-color: rgba(0, 0, 0, 0.07);
	}
	/* today, and the day under the pointer: an outline, so the square keeps
	   its size and its neighbours their places */
	.day.today,
	.day:hover {
		outline: 1px solid black;
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
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 4px 28px;
		margin: 6px 0 0;
		font-size: 0.85rem;
	}
	.summary strong {
		font-weight: 600;
		color: #558b2f;
	}
</style>
