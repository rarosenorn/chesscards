// One reading axis per card side, for boards.
//
// Text needs nothing here: it always reads from the side's left edge, so
// there is nothing for this to decide.
//
// Boards cannot take that edge unconditionally, because a lone board is sized
// to a half-width cell whatever it holds — pinned left on a card that never
// pairs boards, it would sit off to one side against nothing. So the side
// decides: any block holding more than one board pins every board on the side
// left, and a single board below a pair lines up with it instead of sitting
// off in the middle.
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
