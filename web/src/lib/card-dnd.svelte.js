// Shared drag/editing state for the two CardSideEditor instances on a page.
// Created per page (not at module level): module state would be shared across
// requests on the server. The page passes the same object to the front and
// back editors so drags and open board editors work across sides.
export const createCardDnd = () => {
	const cardDnd = $state({
		// true while a drag (blocks or boards) is live; a block the drag empties
		// holds its space for this window so the item can be dragged back, and
		// items only flip into place inside it
		dragging: false,
		// > 0 while space is opening or closing somewhere on the card; FLIP is
		// off for that window, since it would animate items toward a layout the
		// space is still laying out (both sides count — a cross-side drag moves
		// one card's worth of layout)
		spaceAnimating: 0,
		// true for the flush that mounts the placeholder replacing the picked-up
		// item: that space is the item's own and was never gone, so it must not
		// open animated like the ones a drag enters later
		suppressGrow: false,
		// height of the element being dragged, measured at drag start; sizes the
		// empty placeholder box rendered for the drag's shadow item
		dragHeight: 0,
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
