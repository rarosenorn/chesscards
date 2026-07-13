<script>
	import { page } from "$app/state"

	let { basePath, paths, names } = $props();

</script>

<div class="tabs">
	{#each paths as path, i}
		<a href={`${basePath}${paths[i]}`}>{names[i]}</a>
	{/each}
</div>

<style>
	.tabs {
		display: flex;
		padding-left: 100px;
	}
</style>

