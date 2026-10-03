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

// every piece that stands attacked, with what attacks and what guards it:
// what a move was for is mostly read off this — the piece it guards, the
// attack it blocks — and counting attackers is another place a model slips
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
			out.push(`${SIDE[piece.color]}'s ${NAME[piece.type]} on ${piece.square} — attacked by ${by.map(named).join(", ")}; guarded by ${guards.map(named).join(", ") || "nothing"}`);
		}
	return out.join(". ") || "nothing";
}

// a line as it reads: "27.Qxg5 Rxg5 28.Rde2"
const written = line => line.map((move, i) => {
	const number = move.before.split(" ")[5];
	return move.color === "w" ? `${number}.${move.san}` : i === 0 ? `${number}...${move.san}` : move.san;
}).join(" ");

// a line with what it takes and whether it ends in mate
const describeLine = (line, player) => {
	const captures = line.filter(move => move.captured).map(move => `${SIDE[move.color]} takes a ${NAME[move.captured]}`);
	const net = line.reduce((sum, move) => sum + (move.captured ? (move.color === player ? 1 : -1) * VALUE[move.captured] : 0), 0);
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
- "<played move> was a blunder because ..." — bad: what the player was going for, why that was not needed or does not work, and the concrete thing it costs in the engine's line (what is lost, what the opponent gets).
- "<better move> was the best move because ..." — better: what it does that the played move did not, and why it can afford to leave alone whatever the played move was looking after.

Start from the player's own idea. Nobody plays a move for nothing: it guards a piece that is attacked more often than it is guarded, blocks a line, steps out of an attack, offers a trade, makes a threat. When the purpose is plain from the board and the lists of what is attacked, say it as a guess ("you probably wanted to ...") and then say what was wrong with it: the danger was not real, and here is the move that shows it, or the move does not do what it was meant to. When no purpose is plain, do not invent one.

Be concrete. Name the pieces and the squares, and name the mechanism where there is one: a pin (what is pinned to what), a fork, a skewer, a discovered attack, a piece that is overloaded, trapped or left undefended, a back-rank mate. "Wins a pawn" or "loses material" on its own is not a reason: say how.

Follow each thought to its end. Read your reason as the player would and ask what they would ask next — "but then they just take it?", "can't I still do that a move later?" — and answer it from the tries, with the move that refutes the try and why that move works. If the better move wins something or leaves something hanging, say why the opponent cannot take it. If the played move let a chance go, say why it is gone afterwards. Leave out a try no player would think of, like a queen given away for a pawn.

Both lines are printed on the card and the player steps through them move by move, so the question comes back at every move: a capture that fails at once may look possible again two moves later, and fail there for another reason. When the tries show that, give both answers, the later one with its mechanism.

Each of the two is at most three sentences and 60 words, plain casual English, addressed to the player as "you". It continues the sentence: start lowercase, do not repeat the move the sentence opens with, do not write "because". Name the moves that carry the point, not whole lines.

tries: the numbers of the tries you wrote about, at most two for each sentence, or none. Their lines are printed on the card after your words, so do not spell them out in full.

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
	const { ply, kind, move, better, followUp, evalBefore, evalAfter, tries = [] } = mistake;
	const player = move.color;
	return `Side to move: ${SIDE[player]} (the player)
Position before the move (FEN): ${fens[ply]}
${pieceList(fens[ply])}

The player's move, ${kind === "inaccuracy" ? "an" : "a"} ${kind}, and how the engine continues: ${describeLine([move, ...followUp], player)}
  Engine evaluation after it, from the player's side: ${evaluation(evalAfter, player)}

The engine's better move and its line: ${describeLine(better, player)}
  Engine evaluation, from the player's side: ${evaluation(evalBefore, player)}

What stands attacked (pieces attacking directly, not those lined up behind another):
  Before the move: ${attacked(fens[ply])}
  After ${written([move])}: ${attacked(move.after)}
  After ${written([better[0]])}: ${attacked(better[0].after)}

Tries that fail, each with the engine's answer:${tries.length > 0 ? "\n" + tries.map((tried, i) => describeTry(tried, i, mistake, player)).join("\n") : " none found."}`;
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
const strayMoves = (text, { move, better, followUp, tries = [] }) => {
	const given = new Set([move, ...better, ...followUp, ...tries.flatMap(tried => tried.moves)].map(m => m.san.replace(/[+#]/g, "")));
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
			const tries = [...new Set(why.tries.map(number => number - 1))].filter(index => mistake.tries?.[index]);
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
