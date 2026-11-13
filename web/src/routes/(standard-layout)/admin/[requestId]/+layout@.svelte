<script>
	import { page } from "$app/state"

	let { data, children } = $props();

	const paths = ["description", "browse"];
	const names = ["Marketplace view", "Browse"];
</script>

<div class="review-nav-container">
	<div class="breadcrumbs">
		<a href="/admin">Admin</a>
		<span>{"->"}</span>
		<span>{data.request.name}</span>
	</div>
	<div class="tabs">
		{#each paths as path, i}
			<a
				href="/admin/{page.params.requestId}/{path}"
				aria-current={page.url.pathname === `/admin/${page.params.requestId}/${path}`}
			>
				{names[i]}
			</a>
		{/each}
	</div>
</div>

{@render children()}

<style>
	.review-nav-container {
		display: flex;
		box-shadow: inset 0 -4px 6px -4px rgba(0, 0, 0, 0.2);
		align-items: center;
		padding-top: 8px;
		padding-left: 30px;
		padding-right: 30px;
		gap: 20px;
	}
	.tabs {
		align-self: end;
	}
	.tabs > a {
		display: inline-block;
		text-decoration: none;
		position: relative;
		color: black;
		background-color: white;
		border-radius: 4px 4px 0 0;
		cursor: pointer;
		margin-left: 5px;
		border: 1px solid #e3e1e1;
		border-bottom: none;
		padding: 0 16px;
		padding-top: 6px;
		padding-bottom: 3px;
	}
	.tabs [aria-current]:not([aria-current="false"]) {
		color: white !important;
		background-color: var(--accent) !important;
	}
	.tabs > a:hover {
		background-color: rgba(0, 0, 0, 0.05);
	}
	.breadcrumbs a {
		color: black;
	}
	.breadcrumbs a:hover {
		color: blue;
	}
</style>
