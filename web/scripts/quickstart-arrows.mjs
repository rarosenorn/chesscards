// Orange arrows on a deck's Quickstart line cards (the Sielecki decks, skill
// fc-line): at the ply right after each opponent move from their 3rd move on,
// one "warning" arrow per other move the opponent plays at that position in
// any Quickstart line. The opponent's 1st and 2nd moves never get them, nor do
// our own moves. A Quickstart line card is a card of the deck's first chapter
// whose board plays from the first move (solutionFrom 0).
//
//   node scripts/quickstart-arrows.mjs ../specs/sielecki-manual.json           # lists cards that differ
//   node scripts/quickstart-arrows.mjs ../specs/sielecki-manual.json --write   # writes them
import { readFileSync, writeFileSync } from "node:fs"
import { Chess } from "chess.js"

const [, , specPath, mode] = process.argv;
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const lines = spec.chapters[0].cards.filter(card => card.id && card.front?.boards?.[0]?.solutionFrom === 0);

const positionOf = chess => chess.fen().split(" ").slice(0, 4).join(" ");
// each move of a line with the position it is played in
const walk = board => {
	const chess = new Chess(board.fen);
	return board.moves.map((san, ply) => {
		const before = positionOf(chess);
		const move = chess.move(san.replace(/^\.\.\./, ""));
		return { ply, before, move };
	});
}
// the opponent's moves from their 3rd on: Black's when the deck plays White
const counted = (board, ply) => (ply % 2 === (board.orientation === "b" ? 0 : 1)) && Math.floor(ply / 2) >= 2;

const playedAt = new Map();
for (const card of lines) {
	const board = card.front.boards[0];
	for (const { ply, before, move } of walk(board)) {
		if (!counted(board, ply)) continue;
		if (!playedAt.has(before)) playedAt.set(before, new Map());
		playedAt.get(before).set(move.from + move.to, [move.from, move.to]);
	}
}

const arrowsFor = board => {
	const arrows = {};
	for (const { ply, before, move } of walk(board)) {
		if (!counted(board, ply)) continue;
		const others = [...playedAt.get(before).values()].filter(([from, to]) => from + to !== move.from + move.to);
		if (others.length) arrows[String(ply + 1)] = others.map(([from, to]) => ["warning", from, to]);
	}
	return arrows;
}

const same = (a, b) => {
	const norm = arrows => JSON.stringify(Object.keys(arrows).sort((x, y) => x - y).map(key => [key, arrows[key].map(arrow => arrow.join(" ")).sort()]));
	return norm(a) === norm(b);
}

let differing = 0;
for (const card of lines) {
	const board = card.front.boards[0];
	const want = arrowsFor(board);
	if (same(board.arrows ?? {}, want)) continue;
	differing++;
	console.log(`${card.id}: ${JSON.stringify(board.arrows ?? {})} -> ${JSON.stringify(want)}`);
	if (mode === "--write") {
		if (Object.keys(want).length) board.arrows = want;
		else delete board.arrows;
	}
}
console.log(`${lines.length} Quickstart line cards, ${differing} ${mode === "--write" ? "written" : "differ"}`);
if (mode === "--write" && differing) writeFileSync(specPath, JSON.stringify(spec, null, 2) + "\n");
