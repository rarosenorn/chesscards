import { Chess } from "chess.js"
import { ARROW_TYPE, MARKER_TYPE } from "cm-chessboard/src/extensions/right-click-annotator/RightClickAnnotator.js"

// Replays board.moves from board.fen and returns one FEN per position
// (index 0 = start position). Falls back to just the start position if the
// FEN or a move is invalid for chess.js (e.g. a free-form setup position).
const getPositionFens = board => {
	const fens = [board.fen];
	try {
		const chess = new Chess(board.fen);
		for (const san of board.moves) {
			chess.move(san);
			fens.push(chess.fen());
		}
	} catch {
		return [board.fen];
	}
	return fens;
}

const isFenPlayable = fen => {
	try {
		new Chess(fen);
		return true;
	} catch {
		return false;
	}
}

// Annotations are stored with type keys ("success", "danger", ...) instead of
// cm-chessboard's type objects, so they serialize cleanly to JSON.
const arrowKeyFromType = type =>
	Object.keys(ARROW_TYPE).find(key => ARROW_TYPE[key].class === type.class);

const markerKeyFromType = type =>
	Object.keys(MARKER_TYPE).find(key => MARKER_TYPE[key].class === type.class);

const serializeAnnotations = ({ arrows, markers }) => ({
	arrows: arrows
		.map(({ type, from, to }) => ({ type: arrowKeyFromType(type), from, to }))
		.filter(arrow => arrow.type),
	markers: markers
		.map(({ type, square }) => ({ type: markerKeyFromType(type), square }))
		.filter(marker => marker.type)
});

const hasAnnotations = annotation =>
	annotation && (annotation.arrows?.length > 0 || annotation.markers?.length > 0);

// Draws the stored annotation for one position on a board that has the
// Arrows and Markers extensions, replacing whatever is currently drawn.
const showAnnotations = (chessboard, annotation) => {
	chessboard.removeArrows();
	chessboard.removeMarkers();
	for (const { type, from, to } of annotation?.arrows ?? []) {
		if (ARROW_TYPE[type]) chessboard.addArrow(ARROW_TYPE[type], from, to);
	}
	for (const { type, square } of annotation?.markers ?? []) {
		if (MARKER_TYPE[type]) chessboard.addMarker(MARKER_TYPE[type], square);
	}
}

export { getPositionFens, isFenPlayable, serializeAnnotations, hasAnnotations, showAnnotations }
