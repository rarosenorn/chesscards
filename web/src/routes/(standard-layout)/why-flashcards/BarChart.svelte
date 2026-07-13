<script>
	import { Chart, BarController, BarElement, 
		CategoryScale, LinearScale } from "chart.js"
	import ChartDataLabels from "chartjs-plugin-datalabels"
	import { onMount } from "svelte"

	let { id, data, labels, colors,  title, subtitle, note, source } = $props();

	onMount(() => {
		Chart.register(BarController, BarElement, CategoryScale, 
			LinearScale, ChartDataLabels);

		new Chart(document.getElementById(id), {
			type: "bar",
			data: {
				labels: labels,
				datasets: [{
					data: data,
					backgroundColor: colors,
					hoverBackgroundColor: colors,
					borderColor: "grey",
					borderWidth: 2
				}]
			},
			options: {
				scales: {
					y: {
						beginAtZero: true,
						max: 1
					}
				},
				plugins: {
					datalabels: {
						color: "black",
						align: "end",
						anchor: "end",
						backgroundColor: "white",
						padding: 4,
						font: { 
							size: 14,
						},
						formatter: value => value.toFixed(2)
					}
				}
			}
		});
	})
</script>

<div>
	<p class="title">{title}</p>
	{#if subtitle}
		<p class="subtitle">{subtitle}</p>
	{/if}
	<canvas id={id}></canvas>
	{#if note}
		<p class="note">Note: {note}</p>
	{/if}
	<p class="source">Source: {source}</p>
</div>

<style>
	.title {
		font-weight: 500;
		font-size: 1.1rem;
		margin-bottom: 5px;
	}
	.subtitle {
		color: dimgrey;
	}
	.note {
		font-size: 0.9rem;
		color: dimgrey;
	}
	.source {
		font-size: 0.9rem;
		color: dimgrey;
	}
</style>

