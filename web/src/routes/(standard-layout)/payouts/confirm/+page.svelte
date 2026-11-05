<script>
	let { data, form } = $props();
</script>

<div class="confirm">
	{#if form?.confirmed}
		<p>Done: your earnings are now paid to <strong>{form.confirmed}</strong>.</p>
	{:else if data.email && !form?.expired}
		<p>Pay your Chesscards marketplace earnings to <strong>{data.email}</strong>?</p>
		<form method="POST">
			<button class="std-btn">Confirm</button>
		</form>
	{:else}
		<p>This link has expired or was already used. Ask for a new one in <a href="/profile#payouts">Settings</a>.</p>
	{/if}
</div>

<style>
	.confirm {
		margin: 30px 0 80px 0;
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 12px;
	}
	p {
		margin: 0;
	}
</style>
