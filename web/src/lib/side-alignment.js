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

// A card whose every board stands alone, front and back. Such a card never
// puts two boards on a row, so nothing has to line up with a grid column and
// its boards can take more of the card's width (see "solo" in app.css).
const boardsAllAlone = card =>
	boardAlignment(card.front) === "center" && boardAlignment(card.back) === "center";

export { boardAlignment, boardsAllAlone }
