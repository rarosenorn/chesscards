// Shared drag/editing state for the two CardSideEditor instances on a page.
// Created per page (not at module level): module state would be shared across
// requests on the server. The page passes the same object to the front and
// back editors so drags and open board editors work across sides.
export const createCardDnd = () => {
	const cardDnd = $state({
		// true while a drag (blocks or boards) is live, cleared shortly after
		// the drop so its settle still animates; reorder flips only run during
		// this window — everything else (deletes, editor toggles) is instant
		dndAnimating: false,
		// height of the element being dragged, measured at drag start; sizes the
		// empty placeholder box rendered for the drag's shadow item
		dragHeight: 0,
		// true briefly around drag start: the shadow placeholder replacing the
		// picked-up item must appear at full height, while placeholders mounting
		// later (the drag entering another zone) grow in animated
		suppressGrow: false,
		// whether the board being dragged has an open editor; the shadow
		// placeholder then keeps the editor's full-row layout (class + order)
		dragEditing: false,
		// ids of boards currently open in an editor; a board keeps its id wherever
		// it is dragged, so its editor follows it, side changes included
		editingBoards: [],
		// board id -> in-progress editor state, captured when an open editor
		// unmounts (tab navigation, drag re-renders) and restored on remount
		editorStates: {},
		// board id -> true while its open editor holds an invalid FEN; kept
		// live by the editors so error messages track fixes in real time
		invalidBoards: {}
	});
	return cardDnd;
}
