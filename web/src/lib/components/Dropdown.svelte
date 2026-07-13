<script>
	// `label` is the trigger button's text.
	// `menu` is a snippet that renders the menu items (buttons).
	//   It receives a `close` function so an item can close the menu when clicked.
	let { label = "Menu", menu } = $props()

	let open = $state(false)
	let root // the wrapping element, used to detect outside clicks

	const toggle = () => {
		open = !open
	}

	const close = () => {
		open = false
	}

	// Close when clicking anywhere outside the component.
	const onWindowClick = (event) => {
		if (open && root && !root.contains(event.target)) {
			close()
		}
	}

	// Close on Escape.
	const onKeydown = (event) => {
		if (event.key === "Escape") close()
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKeydown} />

<div class="dropdown" bind:this={root}>
	<button class="dropdown-trigger" onclick={toggle} aria-haspopup="menu" aria-expanded={open}>
		{label}
	</button>

	{#if open}
		<div class="dropdown-menu" role="menu">
			{@render menu(close)}
		</div>
	{/if}
</div>

<style>
	.dropdown {
		position: relative;
		display: inline-block;
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		border: 1px solid #ccc;
		border-radius: 5px;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24);
		padding: 4px;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
</style>
