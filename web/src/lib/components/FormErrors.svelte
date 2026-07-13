<script>
	let { form } = $props();
</script>

{#if form?.errors}
	<ul>
		{#each form.errors as error}
			<li style="color: red">{error}</li>
		{/each}
	</ul>
{/if}
