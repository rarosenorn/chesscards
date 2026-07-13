<script>
	import { enhance } from "$app/forms"
	import FormErrors from "$lib/components/FormErrors.svelte"
	let { form } = $props();
</script>

<div class="register-and-login-container">
	<h1>Log in</h1>
	<FormErrors form={form} />
	<form method="POST" use:enhance>
		<label for="email">Email:</label>
		<input 
			name="email" 
			id="email"
			type="email"
			value={form?.email ?? ""}
			required
			autocomplete="off"
		>
		<label for="password">Password:</label>
		<input 
			name="password" 
			id="password" 
			type="password"
			required
			autocomplete="off"
		>
		<button type="submit">Log in</button>
	</form>
</div>

<style>
	div {
		border-radius: 4px;
		border: 1px solid black;
		background-color: white;
		padding: 16px;
		margin: auto;
		margin-top: 100px;
		width: 400px;

		ul {
			color: red;
			padding-left: 16px;
		}

		form {
			display: flex;
			flex-direction: column;

			button {
				margin-top: 10px;
			}
		}

	}
</style>
