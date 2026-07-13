<script>
	import { enhance } from "$app/forms"
	import StandardLayout from "$lib/components/StandardLayout.svelte"
	import FormErrors from "$lib/components/FormErrors.svelte"

	let { data, form } = $props();
</script>

<StandardLayout>
	{data.deck.id}

	<form 
		method="POST" 
		action="?/delete"
		use:enhance={() => {
			return ({ update }) => {
				update({ invalidateAll: false })
			}
		}}
	>
		<button class="delete-button" name="id" value={data.deck.id}>Delete</button>
	</form>
	<FormErrors form={form} />
	<form 
		method="POST" 
		action="?/rename" 
	>
		<input 
			name="name" 
			value={form?.name ?? ""}
			required
			minlength="4"
			maxlength="100"
			autocomplete="off"
		/>
		<input
			name="id"
			type="hidden"
			value={data.deck.id}
		/>
		<button>Rename</button>
	</form>
</StandardLayout>

<style>
	.delete-button {
	color: white;
	background-color: red;
	}
</style>
