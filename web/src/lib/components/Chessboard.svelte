<script>
	import { onMount } from "svelte"
	import "cm-chessboard/assets/chessboard.css"
	import { Chessboard, FEN } from "cm-chessboard/src/Chessboard.js"

	let { minWidth = "409px", fen } = $props();
	let chessboard = $state();
	let board = $state();

	$effect(() => {
		if (board) {
			if (fen) {
				board.setPosition(fen);
			}
		}
	})

	onMount(() => {
		board = new Chessboard(chessboard, {
			position: fen,
			assetsUrl: "/chessboard-assets/", // wherever you copied the assets folder to, could also be in the node_modules folder
			
		})
	})
</script>

<div style="min-width: {minWidth}" bind:this={chessboard}></div>

<style>
	div {
		border: 2px solid #404040;
		border-radius: 2px;
	}
</style>
