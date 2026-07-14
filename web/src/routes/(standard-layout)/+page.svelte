<script>
	import Chessboard from "$lib/components/Chessboard.svelte"
	let { data } = $props();
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
<p>yoo</p>
<p>{data.user?.email}</p>
<Chessboard minWidth="400px" board="8/8/8/2P2P2/8/2P2P2/8/8 w - - 0 1" />
