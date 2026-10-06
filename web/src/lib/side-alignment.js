// One reading axis per card side, for boards.
//
// Text needs nothing here: a text block is only as wide as its text, up to the
// measure, and the side centers it — so a short prompt reads centered and a
// wrapped paragraph fills the measure and reads left-aligned from a fixed
// edge, with no rule that switches between the two.
//
// Boards cannot do that, because a lone board is sized to a half-width cell
// whatever its content. So the side decides: any block holding more than one
// board pins every board on the side left, and a single board below a pair
// lines up with it instead of sitting off in the middle.
const boardAlignment = side =>
	(side ?? []).some(block => block.type === "chessboards" && block.content.length > 1)
		? "left"
		: "center";

export { boardAlignment }
