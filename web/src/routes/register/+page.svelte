<script>
	import FormErrors from "$lib/components/FormErrors.svelte"
	import * as zod from "$lib/zod-schemas.js"

	let { form } = $props();
</script>

<div class="register-and-login-container">
	<h1>Register</h1>
	<FormErros form={form} />
	<form method="POST">
		<label for="email">Email:</label>
		<input 
			name="email" 
			id="email"
			type="email"
			value={form?.email ?? ""}
			required
		/>
		<label for="password">Password: (min. 6 characters)</label>
		<input 
			name="password" 
			id="password"
			type="password" 
			required
			minlength="6"
		/>
		<label for="confirm-password">Confirm password:</label>
		<input 
			name="confirm-password" 
			id="confirm-password"
			type="password" 
			required
		/>
		<button>Register</button>
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
