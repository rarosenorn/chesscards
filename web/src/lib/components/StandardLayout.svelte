<script>
	import { page } from "$app/state";
	let { children, headerActions } = $props();
</script>

<div class="page-container">
	<div class="page-heading">
		<h1>{page.data.pageTitle}</h1>
		{#if headerActions}
			{@render headerActions()}
		{/if}
	</div>
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
		padding: 20px 15px 15px 15px;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.page-heading h1 {
		font-size: 1.5rem;
	}
	.page-content {
		padding: 25px;
		display: flex;
		flex-direction: column;
	}
</style>
