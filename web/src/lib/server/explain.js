import { spawn } from "node:child_process"
import { Chess } from "chess.js"

// Why a mistake was one, in words. The engine has already decided everything
// about the chess — the move, the better one, the lines after both, and what
// becomes of the tempting moves along them — and the model is only asked to
// say what those lines show. It is given the board as a list of pieces and
// each line's captures counted out, because reading a position off a FEN and
// adding up material are where a language model slips.
//
// For now the model is the Claude Code CLI on this machine, which runs on
// its owner's own login: good while the owner is the only user. A deployed
// app has to call the API with a key instead — that is the one function to
// replace, askClaude.
const MODEL = process.env.EXPLAIN_MODEL ?? "claude-opus-5-5";
const TIMEOUT = 120_000;

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const SIDE = { w: "White", b: "Black" };

const pieceList = fen => {
	const by = { w: [], b: [] };
	for (const rank of new Chess(fen).board())
		for (const piece of rank)
			if (piece) by[piece.color].push(`${piece.type === "p" ? "" : piece.type.toUpperCase()}${piece.square}`);
	return `White: ${by.w.join(" ")}\nBlack: ${by.b.join(" ")}`;
}

// every piece that stands attacked as often as it is guarded, or by a
// cheaper piece, with what attacks and what guards it: what a move was for
// is mostly read off this — the piece it guards, the attack it blocks — and
// counting attackers is another place a model slips. A piece guarded more
// often than cheaper pieces attack it is in no danger, and listed it only
// invites "guards it a third time".
const attacked = fen => {
	const chess = new Chess(fen);
	const named = square => { const piece = chess.get(square); return `${piece.type === "p" ? "" : piece.type.toUpperCase()}${square}`; };
	const out = [];
	for (const rank of chess.board())
		for (const piece of rank) {
			if (!piece || piece.type === "k") continue;
			const other = piece.color === "w" ? "b" : "w";
			const by = chess.attackers(piece.square, other);
			if (by.length === 0) continue;
			const guards = chess.attackers(piece.square, piece.color);
			if (by.length < guards.length && by.every(square => VALUE[chess.get(square).type] >= VALUE[piece.type])) continue;
			out.push(`${SIDE[piece.color]}'s ${NAME[piece.type]} on ${piece.square} — attacked by ${by.map(named).join(", ")}; guarded by ${guards.map(named).join(", ") || "nothing"}`);
		}
	return out.join(". ") || "nothing";
}

// Every piece but the pawns and the kings with the number of moves it has,
// a bishop with the colour of its squares, and a knight or bishop in the other half that no enemy pawn can ever
// attack marked as on an outpost: a positional reason is read off these —
// which piece was doing something and which was boxed in — not guessed.
const activity = fen => {
	const sides = { w: [], b: [] };
	const [placement, turn] = fen.split(" ");
	const chess = new Chess(fen);
	for (const color of ["w", "b"]) {
		let mover = chess;
		if (color !== turn) {
			try { mover = new Chess([placement, color, "-", "-", 0, 1].join(" ")); }
			catch { mover = null; }
		}
		for (const rank of chess.board())
			for (const piece of rank) {
				if (!piece || piece.color !== color || piece.type === "p" || piece.type === "k") continue;
				const count = mover ? mover.moves({ square: piece.square }).length : null;
				const notes = [
					piece.type === "b" && `${chess.squareColor(piece.square)} squares`,
					count != null && `${count} ${count === 1 ? "move" : "moves"}`,
					isOutpost(chess, piece) && "outpost"
				].filter(Boolean);
				sides[color].push(`${piece.type.toUpperCase()}${piece.square}${notes.length ? ` (${notes.join(", ")})` : ""}`);
			}
	}
	return `White: ${sides.w.join(", ")}\n  Black: ${sides.b.join(", ")}`;
}

// no enemy pawn on a file beside it that could still come level with it
const isOutpost = (chess, { type, color, square }) => {
	if (type !== "n" && type !== "b") return false;
	const file = square.charCodeAt(0) - 97, rank = Number(square[1]);
	if (color === "w" ? rank < 5 : rank > 4) return false;
	for (const rows of chess.board())
		for (const pawn of rows)
			if (pawn?.type === "p" && pawn.color !== color && Math.abs(pawn.square.charCodeAt(0) - 97 - file) === 1
				&& (color === "w" ? Number(pawn.square[1]) > rank : Number(pawn.square[1]) < rank)) return false;
	return true;
}

// a line as it reads: "27.Qxg5 Rxg5 28.Rde2"
const written = line => line.map((move, i) => {
	const number = move.before.split(" ")[5];
	return move.color === "w" ? `${number}.${move.san}` : i === 0 ? `${number}...${move.san}` : move.san;
}).join(" ");

// both lines level in material and neither a mate: the engine's preference
// is then positional, and there is no way out to argue
const isPositional = ({ move, better, followUp }) => netMaterial([move, ...followUp], move.color) === netMaterial(better, move.color)
	&& ![...followUp, ...better].some(m => m.san.endsWith("#"));

const netMaterial = (line, player) => line.reduce((sum, move) => sum + (move.captured ? (move.color === player ? 1 : -1) * VALUE[move.captured] : 0), 0);

// a line with what it takes and whether it ends in mate
const describeLine = (line, player) => {
	const captures = line.filter(move => move.captured).map(move => `${SIDE[move.color]}'s ${NAME[move.piece]} from ${move.from} takes the ${NAME[move.captured]} on ${move.to}`);
	const net = netMaterial(line, player);
	const mate = line.at(-1)?.san.endsWith("#");
	return `${written(line)}\n  Captures in this line: ${captures.join("; ") || "none"}. Net material for the player: ${net >= 0 ? "+" : ""}${net}.${mate ? " The line ends in checkmate." : ""}`;
}

// a try, numbered as the model is to name it, with the board as it stands
// once the answer to it is played: the pin or the fork is there to be read
const describeTry = ({ line, at, moves }, index, { move, better, followUp }, player) => {
	const whole = line === "better" ? better : [move, ...followUp];
	const instead = whole[at] ? `instead of ${written([whole[at]])} ` : "";
	return `T${index + 1}. In the ${line} line, after ${written(whole.slice(0, at))}, ${instead}${SIDE[moves[0].color]} could try: ${describeLine(moves, player)}
  Pieces after ${moves[1].san}: ${pieceList(moves[1].after).replace("\n", "; ")}`;
}

const evaluation = (score, player) => {
	const sign = player === "w" ? 1 : -1;
	if (score.mate != null) return sign * score.mate > 0 ? `the player mates in ${Math.abs(score.mate)}` : `the player is mated in ${Math.abs(score.mate)}`;
	const pawns = sign * score.cp / 100;
	return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(1)} pawns`;
}

const SYSTEM = `You write the back of a chess flashcard about a mistake the player made in their own game. You are given the position, the move they played with the engine's continuation, the engine's better move with its continuation, what stands attacked before and after each of the two moves, and the tries: tempting moves along the two lines that fail, each with the engine's answer to it. The engine lines are the only source of truth about what happens: explain what they show, and do not claim anything they do not show.

The card prints two sentences and you write the end of each:
- "<played move> was a blunder because ..." — bad: why the point of the move was not good, and the concrete thing it costs in the engine's line (what is lost, what the opponent gets).
- "<better move> was the best move because ..." — better: what it does that the played move did not, and why the opponent's obvious answer to it does not work.

Write flat statements about moves, in the shape "X doesn't work because Y", "X wasn't needed because Y", "X loses to Y": "Bxe4 doesn't work because Rd4 pins the bishop to the queen". Never guess at what the player was thinking, and never write "you probably wanted" or the like.

The played move usually has a plain point: it guards a piece that is attacked more often than it is guarded, blocks a line, steps out of an attack, offers a trade, makes a threat. Where that point is plain from the board and the lists of what is attacked, say why it was not good — the danger was not real, with the move that shows it, or the move does not do the job. Where it is not plain, leave it out.

Be concrete. Name the pieces and the squares, and name the mechanism where there is one: a pin (what is pinned to what), a fork, a skewer, a discovered attack, a piece that is overloaded, trapped or left undefended, a back-rank mate. "Wins a pawn" or "loses material" on its own is not a reason: say how.

When the two lines come out level in material and neither mates, there is no such mechanism: the engine prefers the better move for a positional reason, and that is the reason to give, read off the facts given. For the played move: a piece traded for one that was doing less (the move counts show which piece was active and which was boxed in), a piece given up or driven off an outpost, a weakness the move leaves. For the better move: what it keeps that the played move gave away, and what it goes on to do in the better line further on. Say it as plainly as a coach would: "it trades your knight on its outpost for a bishop that had two squares".

Follow each thought to its end. The player's next question is "but then they just take it?" or "can't I still do that a move later?": answer it from the tries, with the move that refutes the try and why that move works. Both lines are printed on the card and stepped through move by move, so a capture that fails at once may look possible again two moves later and fail there for another reason: then the later answer, with its mechanism, is the one to give. Leave out a try no player would think of, like a queen given away for a pawn.

Be brief: each of the two is at most two sentences and 35 words, and shorter when one statement says it. No filler, no scene-setting, nothing that restates what the board already shows. Plain casual English; the player is "you". It continues the sentence: start lowercase, do not repeat the move the sentence opens with, do not write "because" at the start. Name the moves that carry the point, not whole lines.

tries: the numbers of the tries you wrote about, at most two for each sentence, or none. Their lines are printed on the card after your words, so do not spell them out in full.

Count from the lists of what stands attacked before you claim pressure or a guard: a square is under pressure only when it is attacked more often than it is guarded, and a move that guards something already guarded more often than it is attacked does nothing worth saying. Never give as a reason that a move keeps a piece, keeps an option or lets a piece come back later: say what the piece does where it goes.

Rules: name only moves that appear in the lines and tries you were given, written exactly as given, and say after which move a try comes when it is not the first move of its line. Check every piece and square you mention against the piece lists: a try's own list is the board after the answer to it. No evaluation numbers, no bold, no lists, no square brackets, no "T1", no "the engine says".`;

const SCHEMA = {
	type: "object",
	properties: {
		bad: { type: "string" },
		better: { type: "string" },
		tries: { type: "array", items: { type: "integer" } }
	},
	required: ["bad", "better", "tries"],
	additionalProperties: false
};

const prompt = ({ fens }, mistake) => {
	const { ply, kind, move, better, plan = better, followUp, evalBefore, evalAfter, tries = [] } = mistake;
	const player = move.color;
	const positional = isPositional(mistake);
	return `Side to move: ${SIDE[player]} (the player)
Position before the move (FEN): ${fens[ply]}
${pieceList(fens[ply])}

The player's move, ${kind === "inaccuracy" ? "an" : "a"} ${kind}, and how the engine continues: ${describeLine([move, ...followUp], player)}
  Engine evaluation after it, from the player's side: ${evaluation(evalAfter, player)}

The engine's better move and its line: ${describeLine(better, player)}
  Engine evaluation, from the player's side: ${evaluation(evalBefore, player)}${plan.length > better.length ? `
  The better line further on: ${written(plan)}` : ""}

Material: ${positional ? "the two lines come out level, so the difference is positional." : "the two lines do not come out level."}

The pieces before the move, with how many moves each has:
  ${activity(fens[ply])}

What stands attacked as often as it is guarded, or by a cheaper piece (pieces attacking directly, not those lined up behind another):
  Before the move: ${attacked(fens[ply])}
  After ${written([move])}: ${attacked(move.after)}
  After ${written([better[0]])}: ${attacked(better[0].after)}

Tries that fail, each with the engine's answer:${positional ? " none to write about, the difference being positional." : tries.length > 0 ? "\n" + tries.map((tried, i) => describeTry(tried, i, mistake, player)).join("\n") : " none found."}`;
}

// The flags past --json-schema keep the call to what it is: no tools, and
// none of the connectors, skills and settings an interactive session loads —
// with them every call carries tens of thousands of tokens it has no use for.
const askClaude = user => new Promise((done, reject) => {
	const proc = spawn("claude", [
		"-p", user,
		"--model", MODEL,
		"--system-prompt", SYSTEM,
		"--output-format", "json",
		"--json-schema", JSON.stringify(SCHEMA),
		"--tools", "",
		"--no-session-persistence", "--strict-mcp-config", "--disable-slash-commands", "--setting-sources", ""
	], { stdio: ["ignore", "pipe", "pipe"] });
	let out = "", err = "";
	proc.stdout.on("data", chunk => out += chunk);
	proc.stderr.on("data", chunk => err += chunk);
	const timer = setTimeout(() => { proc.kill(); reject(new Error("Claude took too long")); }, TIMEOUT);
	proc.on("error", error => { clearTimeout(timer); reject(error); });
	proc.on("close", () => {
		clearTimeout(timer);
		try {
			const result = JSON.parse(out);
			const answer = result.structured_output;
			if (result.is_error || typeof answer?.bad !== "string" || typeof answer?.better !== "string")
				throw new Error(result.result || "no explanation in the answer");
			done({ bad: answer.bad, better: answer.better, tries: Array.isArray(answer.tries) ? answer.tries : [] });
		} catch (error) {
			reject(new Error(`Claude: ${error.message}${err ? ` (${err.trim().slice(0, 200)})` : ""}`));
		}
	});
});

// Moves the prose names that are in no line it was given. Only what is
// unmistakably a move is read as one — a piece letter, a capture, castling —
// since a bare "e6" is as often a square as a pawn push.
const MOVE = /\b(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|O-O(?:-O)?)/g;
const strayMoves = (text, { move, better, plan = [], followUp, tries = [] }) => {
	const given = new Set([move, ...better, ...plan, ...followUp, ...tries.flatMap(tried => tried.moves)].map(m => m.san.replace(/[+#]/g, "")));
	return (text.match(MOVE) ?? []).filter(san => !given.has(san));
}

// { bad, better, tries } for one mistake — the two reasons and the indexes of
// the mistake's tries they speak of — or null when the model could not be
// reached, did not answer, or twice wrote about moves it was not given: the
// card is still worth having without it
const explainMistake = async (game, mistake) => {
	try {
		for (let attempt = 0; attempt < 2; attempt++) {
			const why = await askClaude(prompt(game, mistake));
			const stray = strayMoves(`${why.bad} ${why.better}`, mistake);
			// the model counts the tries from 1, as they are written to it
			const tries = isPositional(mistake) ? [] : [...new Set(why.tries.map(number => number - 1))].filter(index => mistake.tries?.[index]);
			if (stray.length === 0) return { ...why, tries };
			console.error(`explain: named moves outside the lines (${stray.join(", ")})`);
		}
		return null;
	} catch (error) {
		console.error(`explain: ${error.message}`);
		return null;
	}
}

export { explainMistake, prompt }
