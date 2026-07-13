<script>
	import { page } from "$app/state";
	let { children } = $props();
</script>

<div class="page-container">
	<h1 class="page-heading">{page.data.pageTitle}</h1>
	<div class="page-content">
		{@render children()}
	</div>
</div>

<style>
	.page-container {
		max-width: 1000px;
		margin: 0 auto;
		margin-top: 25px;
		display: flex;
		flex-direction: column;
		background-color: white;
	}
	.page-heading {
		box-shadow: inset 0 -4px 6px -4px rgba(0, 0, 0, 0.2);
		padding: 20px 0 15px 15px;
		font-size: 1.5rem;
	}
	.page-content {
		padding: 25px;
		display: flex;
		flex-direction: column;
	}
</style>
