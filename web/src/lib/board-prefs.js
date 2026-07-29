// User board preferences. Allowed values mirror exactly what ships with
// cm-chessboard: the piece sprites in assets/pieces/, the themes defined in
// assets/chessboard.css and its BORDER_TYPE values.
const PIECE_SETS = ["standard", "staunty"];
const BOARD_THEMES = ["default", "default-contrast", "green", "blue", "chess-club", "chessboard-js", "black-and-white"];
// black: the app's own dark border (cm-chessboard border "none");
// frame: cm-chessboard's wide border with coordinates in it;
// none: no border at all
const BORDER_TYPES = ["black", "frame", "none"];
const ANIMATION_DURATIONS = [300, 150, 0];

const DEFAULT_BOARD_PREFS = {
	pieceSet: "standard",
	boardTheme: "default",
	borderType: "black",
	showCoordinates: true,
	animationDuration: 300
};

// style fragment for the cm-chessboard constructor
const boardStyleProps = prefs => ({
	cssClass: prefs.boardTheme,
	borderType: prefs.borderType === "frame" ? "frame" : "none",
	showCoordinates: prefs.showCoordinates,
	animationDuration: prefs.animationDuration,
	pieces: { file: `pieces/${prefs.pieceSet}.svg` }
});

// the black option is drawn by the app, not cm-chessboard
const hasBlackBorder = prefs => prefs.borderType === "black";

// cm-chessboard inlines the piece sprite into one page-wide div and only ever
// checks that the div exists — not which file filled it — and the div outlives
// client-side navigation. Wrap board construction: drop a cache built from
// another piece set first, stamp the fresh one after.
const withSpriteCache = (pieceSet, createBoard) => {
	const cached = document.getElementById("cm-chessboard-sprite");
	if (cached && cached.dataset.pieceSet !== pieceSet) cached.remove();
	const board = createBoard();
	const fresh = document.getElementById("cm-chessboard-sprite");
	if (fresh) fresh.dataset.pieceSet = pieceSet;
	return board;
};

export { PIECE_SETS, BOARD_THEMES, BORDER_TYPES, ANIMATION_DURATIONS, DEFAULT_BOARD_PREFS, boardStyleProps, hasBlackBorder, withSpriteCache }
