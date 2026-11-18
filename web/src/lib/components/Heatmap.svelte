<script>
	import { heatmapWeeks, monthLabels, sayDay, streaks } from "$lib/heatmap.js"

	// Study day by day, a square each: today in the middle, half a year
	// behind it and half a year ahead (see lib/heatmap.js).
	// days: every day anything was answered, each { day, count }.
	// forecast: every day ahead that cards fall due on, each { day, count }.
	// today: the study day it is now.
	let { days, forecast = [], today } = $props();

	let weeks = $derived(heatmapWeeks(days, today, 26, 26, forecast));
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
						{#if cell.future}
							<span
								class="day due-{cell.level}"
								class:today={cell.today}
								data-tip="{cell.count ? `${plural(cell.count, "card")} due` : "No cards due"} on {sayDay(cell.day)}"
							></span>
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
		</div>
		<div class="months" aria-hidden="true">
			{#each months as month}
				<span>{month}</span>
			{/each}
		</div>
	</div>
	<!-- each figure under its own name, the figure in the squares' green -->
	<p class="summary">
		<span>Total: <strong>{plural(summary.total, "review")}</strong></span>
		<span>Average on active days: <strong>{plural(summary.average, "review")}</strong></span>
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
	/* Anki's Review Heatmap add-on, as it colours and grades them: what was
	   studied in the ten greens of its lime theme, light to dark... */
	.day.level-1 {
		background-color: #d6e685;
	}
	.day.level-2 {
		background-color: #bddb7a;
	}
	.day.level-3 {
		background-color: #a4d06f;
	}
	.day.level-4 {
		background-color: #8cc665;
	}
	.day.level-5 {
		background-color: #74ba58;
	}
	.day.level-6 {
		background-color: #5cae4c;
	}
	.day.level-7 {
		background-color: #44a340;
	}
	.day.level-8 {
		background-color: #378f36;
	}
	.day.level-9 {
		background-color: #2a7b2c;
	}
	.day.level-10 {
		background-color: #1e6823;
	}
	/* ...and what falls due on the days ahead in its ten greys, the more
	   cards the darker */
	.day.due-1 {
		background-color: #d9d9d9;
	}
	.day.due-2 {
		background-color: #cacaca;
	}
	.day.due-3 {
		background-color: #bbbbbb;
	}
	.day.due-4 {
		background-color: #acacac;
	}
	.day.due-5 {
		background-color: #9d9d9d;
	}
	.day.due-6 {
		background-color: #8e8e8e;
	}
	.day.due-7 {
		background-color: #7f7f7f;
	}
	.day.due-8 {
		background-color: #707070;
	}
	.day.due-9 {
		background-color: #616161;
	}
	.day.due-10 {
		background-color: #525252;
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
		color: #378f36;
	}
</style>
