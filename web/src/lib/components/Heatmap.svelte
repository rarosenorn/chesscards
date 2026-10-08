<script>
	import { heatmapMonths, sayDay, streaks } from "$lib/heatmap.js"

	// The year's study, a square a day, month by month (see lib/heatmap.js).
	// days: every day anything was answered, each { day, count }.
	// today: the study day it is now.
	let { days, today } = $props();

	let months = $derived(heatmapMonths(days, today));
	let summary = $derived(streaks(days, today));

	const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
</script>

<div class="heatmap">
	<!-- the weekdays and the months keep to each other; the row of them is
	     what is centred -->
	<div class="chart">
		<div class="weekdays" aria-hidden="true">
			<span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
		</div>
		{#each months as month (month.label)}
			<div class="month">
				<!-- the app's own tooltip says each day's date and count -->
				<div class="weeks">
					{#each month.weeks as week}
						{#each week as cell}
							{#if !cell}
								<span></span>
							{:else if cell.future}
								<span class="day"></span>
							{:else}
								<span
									class="day level-{cell.level}"
									class:today={cell.today}
									data-tip="{cell.count ? plural(cell.count, "review") : "No reviews"} on {sayDay(cell.day)}"
								></span>
							{/if}
						{/each}
					{/each}
				</div>
				<span class="month-name">{month.label}</span>
			</div>
		{/each}
	</div>
	<p class="summary">
		{plural(summary.total, "review")} in the last year
		· current streak {plural(summary.current, "day")}
		· longest {plural(summary.longest, "day")}
	</p>
</div>

<style>
	.heatmap {
		--cell: 10px;
		--gap: 2px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		font-size: 0.75rem;
		color: rgba(0, 0, 0, 0.55);
	}
	/* each month stands on its own, a gap from the next, as in Anki's */
	.chart {
		display: flex;
		align-items: start;
		gap: 10px;
	}
	.weekdays,
	.weeks {
		display: grid;
		grid-template-rows: repeat(7, var(--cell));
		gap: var(--gap);
	}
	.weekdays {
		width: 10px;
		margin-right: -4px;
		line-height: var(--cell);
		font-size: 0.65rem;
		text-align: center;
	}
	.month {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	/* a week is a column: the days run down it, then on to the next */
	.weeks {
		grid-auto-flow: column;
		grid-auto-columns: var(--cell);
	}
	.month-name {
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
		margin: 6px 0 0;
		font-size: 0.85rem;
	}
</style>
