import { Mark, mergeAttributes } from "@tiptap/core"
import { looseChess, moveLabel } from "$lib/board-utils.js"

// A move written in a card's text, wired to one of the card's boards: click it
// and that board plays it. What the mark stores is where the move sits, not
// what it says — `board` is the card-wide board number (front then back, the
// numbers in the strip above each board), `from` the ply of that board's own
// line the move leaves it at, `moves` the aside's own moves from there (empty
// for a move already on the line), and `at` which of them this token is.
//
// Every token of one aside carries the same branch, so a click anywhere in it
// plays the whole aside and stops on the move that was clicked — and an aside
// is edited as a unit, since its tokens would otherwise drift apart.
export const MoveRef = Mark.create({
	name: "moveRef",
	// a move is a closed thing: typing against its edge writes ordinary text
	inclusive: false,
	// tokens of the same aside differ by `at`, so PM never merges them; this
	// only stops two identical tokens written side by side from fusing
	spanning: false,

	addAttributes() {
		return {
			board: {
				default: 1,
				parseHTML: el => Number(el.getAttribute("data-move-ref")) || 1,
				renderHTML: attrs => ({ "data-move-ref": attrs.board })
			},
			from: {
				default: 0,
				parseHTML: el => Number(el.getAttribute("data-from")) || 0,
				renderHTML: attrs => ({ "data-from": attrs.from })
			},
			// space-separated SAN, the way the moves read; empty for a token
			// that only names a ply of the board's own line
			moves: {
				default: "",
				parseHTML: el => el.getAttribute("data-moves") ?? "",
				renderHTML: attrs => ({ "data-moves": attrs.moves })
			},
			at: {
				default: 0,
				parseHTML: el => Number(el.getAttribute("data-at")) || 0,
				renderHTML: attrs => ({ "data-at": attrs.at })
			}
		}
	},

	parseHTML() {
		return [{ tag: "span[data-move-ref]" }]
	},

	renderHTML({ HTMLAttributes }) {
		return ["span", mergeAttributes(HTMLAttributes, { class: "move-ref" }), 0]
	}
})

// what a click on a rendered token asks of its board
export const parseMoveRef = el => {
	const board = Number(el.dataset.moveRef);
	if (!board) return null;
	return {
		board,
		from: Number(el.dataset.from) || 0,
		moves: (el.dataset.moves ?? "").split(" ").filter(Boolean),
		at: Number(el.dataset.at) || 0
	};
}

// "5...Nf6", "5.", "6" — a move number the author typed or pasted along with
// the move; the aside is stored as moves alone and numbered from the position
// it branches at, so a line copied out of a book works as it was written
const stripNumber = token => token.replace(/^\d+[.…]*/, "");

// The moves of an aside, played from `fen`. Returns them normalized (chess.js's
// own SAN, so "0-0" is stored as "O-O") with the info each needs to be
// numbered, or the first move that does not play.
export const parseAside = (fen, text) => {
	const sans = text.trim().split(/\s+/).map(stripNumber).filter(Boolean);
	const moves = [];
	const infos = [];
	let current = fen;
	for (const san of sans) {
		try {
			const chess = looseChess(current);
			const color = chess.turn();
			const number = chess.moveNumber();
			const move = chess.move(san);
			moves.push(move.san);
			infos.push({ san: move.san, color, number });
			current = chess.fen();
		} catch {
			return { moves, infos, error: san };
		}
	}
	return { moves, infos, error: null };
}

// The moves as they go into the document: one marked token per move, ordinary
// spaces between them, so each move is its own click target and the run still
// reads as a sentence does.
//
// `line` is the board's own moves, and however far the written ones simply
// follow it, they ARE it: those tokens name a ply of the line rather than
// opening an aside, so clicking one steps the board exactly as clicking it in
// the move line would. The aside starts where the two part company — which is
// how a whole line written out ("1.e4 e5 2.Nf3 Nc6") wires itself up, half of
// it to the board's line and the rest to the branch it leaves.
export const moveRefContent = ({ board, from, moves, infos, line = [] }) => {
	let shared = 0;
	while (shared < moves.length && line[from + shared] === moves[shared]) shared += 1;
	const branch = moves.slice(shared).join(" ");
	return infos.flatMap((info, i) => [
		...(i > 0 ? [{ type: "text", text: " " }] : []),
		{
			type: "text",
			text: moveLabel(info, i),
			marks: [{
				type: "moveRef",
				attrs: i < shared
					? { board, from: from + i + 1, moves: "", at: 0 }
					: { board, from: from + shared, moves: branch, at: i - shared + 1 }
			}]
		}
	]);
}
