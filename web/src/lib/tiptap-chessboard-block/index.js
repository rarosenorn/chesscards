// Public surface of the add-cards chessboard block: the PM node, the virtual
// caret keymap/plugins, and the insert commands. Internals live in node/
// caret/insert/geometry — import from here.
export { BlockNode } from "./node.svelte.js"
export { BlockNavigation, configureBlockUiCleanup } from "./caret.js"
export { insertChessboardBlock, insertBoardAtCaret } from "./insert.js"
