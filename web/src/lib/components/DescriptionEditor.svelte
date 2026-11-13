<script>
	import { onMount } from "svelte"
	import CardSideBlockEditor from "$lib/components/CardSideBlockEditor.svelte"
	import DocEditorMenuBar from "$lib/components/DocEditorMenuBar.svelte"
	import MoveRefDialog from "$lib/components/MoveRefDialog.svelte"
	import { insertChessboardBlock, insertBoardAtCaret } from "$lib/tiptap-chessboard-block/index.js"
	import { sideToDoc, docToSideBlocks, docCountBoardsBlocks, docHasBoardPairBlocks, docBoardsBlocks, docInvalidBoardNumbersBlocks, invalidFenMessage } from "$lib/card-utils.js"

	// A deck description: one side of the card editor — text and boards, the
	// boards as a card's back has them (no hidden back layer, nothing to turn).
	// `doc` (an editor document captured with getDoc) wins over `blocks` (a
	// stored description), so a host that unmounts this can bring the edit
	// back as it was.
	let { blocks = null, doc = null, onSubmit = null } = $props();

	const boardUi = { editingIds: new Set(), editorStates: {}, applyEditors: {}, invalidBoards: {} };
	// svelte-ignore state_referenced_locally -- initial content only; edits live in the editor
	const initialDoc = doc ?? sideToDoc(blocks ?? []);

	let editor = $state();

	export const getDoc = () => editor?.getJson();

	// the card editor's save gating: open board editors are applied as if Ok
	// was pressed, and an invalid FEN is an error
	export const read = () => {
		for (const apply of Object.values(boardUi.applyEditors)) apply();
		const json = editor.getJson();
		const invalid = docInvalidBoardNumbersBlocks(json, 0, boardUi);
		return {
			blocks: docToSideBlocks(json),
			errors: invalid.length > 0 ? [invalidFenMessage(invalid)] : []
		};
	}

	let boards = $state(0);
	let pair = $state(false);
	const recount = () => {
		boards = docCountBoardsBlocks(editor?.getJson());
		pair = docHasBoardPairBlocks(editor?.getJson());
	}
	onMount(recount);

	// the menu-bar glue of the card editor (CardBlockEdit), for one side
	let menu = $state({ editor: null, focused: false });
	const handleEditorFocus = ed => queueMicrotask(() => { menu = { editor: ed, focused: true } });
	const handleEditorBlur = ed => queueMicrotask(() => {
		if (menu.editor === ed && !ed.isFocused) menu = { editor: ed, focused: false };
	});
	const handleEditorRefresh = ed => queueMicrotask(() => {
		if (menu.editor === ed) menu = { ...menu, editor: ed };
		recount();
	});

	let movesOpen = $state(false);
	let movesBoards = $state([]);
	const openMoves = () => {
		movesBoards = docBoardsBlocks(editor?.getJson())
			.map((board, i) => ({ number: i + 1, fen: board.fen, moves: board.moves ?? [] }));
		movesOpen = movesBoards.length > 0;
	}
	const insertMoves = content => {
		movesOpen = false;
		editor?.getEditor()?.chain().focus().insertContent(content).run();
	}

	const addChessboard = () => {
		const ed = editor.getEditor();
		if (!insertBoardAtCaret(ed, boardUi)) insertChessboardBlock(ed, boardUi);
	}

	// the editor's own shortcuts (lists, board) are the browser's too
	const handleKeyDown = e => {
		if (!(e.ctrlKey || e.metaKey)) return;
		if (e.key === "Enter" && onSubmit) {
			e.preventDefault();
			onSubmit();
		}
		if (e.key === "u" || e.key === "o" || e.key === "k") e.preventDefault();
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="description-editor">
	<div class="menu-holder">
		<DocEditorMenuBar
			{menu}
			onAddChessboard={addChessboard}
			onInsertMoves={openMoves}
			movesDisabled={boards === 0}
		/>
		{#if movesOpen}
			<MoveRefDialog
				boards={movesBoards}
				onInsert={insertMoves}
				onClose={() => movesOpen = false}
			/>
		{/if}
	</div>
	<div class="editor-wrap" class:show-board-numbers={boards > 1} class:boards-solo={!pair} class:boards-left={pair} style="--board-offset: 0">
		<CardSideBlockEditor
			bind:this={editor}
			{boardUi}
			isBack
			{initialDoc}
			onEditorFocus={handleEditorFocus}
			onEditorBlur={handleEditorBlur}
			onEditorTransaction={handleEditorRefresh}
		/>
	</div>
</div>

<style>
	.description-editor {
		display: flex;
		flex-direction: column;
	}
	.menu-holder {
		/* the moves panel hangs from this */
		position: relative;
		margin-bottom: 4px;
	}
</style>
