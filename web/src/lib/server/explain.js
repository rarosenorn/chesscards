import { spawn } from "node:child_process"
import { Chess } from "chess.js"

// Why a mistake was one, in words. The engine has already decided everything
// about the chess — the move, the better one, the lines after both — and the
// model is only asked to say what those lines show. It is given the board as
// a list of pieces and each line's captures counted out, because reading a
// position off a FEN and adding up material are where a language model slips.
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

// a line as it reads ("27.Qxg5 Rxg5 28.Rde2"), with what it takes and whether
// it ends in mate
const describeLine = (line, player) => {
	const written = line.map((move, i) => {
		const number = move.before.split(" ")[5];
		return move.color === "w" ? `${number}.${move.san}` : i === 0 ? `${number}...${move.san}` : move.san;
	}).join(" ");
	const captures = line.filter(move => move.captured).map(move => `${SIDE[move.color]} takes a ${NAME[move.captured]}`);
	const net = line.reduce((sum, move) => sum + (move.captured ? (move.color === player ? 1 : -1) * VALUE[move.captured] : 0), 0);
	const mate = line.at(-1)?.san.endsWith("#");
	return `${written}\n  Captures in this line: ${captures.join("; ") || "none"}. Net material for the player: ${net >= 0 ? "+" : ""}${net}.${mate ? " The line ends in checkmate." : ""}`;
}

const evaluation = (score, player) => {
	const sign = player === "w" ? 1 : -1;
	if (score.mate != null) return sign * score.mate > 0 ? `the player mates in ${Math.abs(score.mate)}` : `the player is mated in ${Math.abs(score.mate)}`;
	const pawns = sign * score.cp / 100;
	return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(1)} pawns`;
}

const SYSTEM = `You write the back of a chess flashcard about a mistake the player made in their own game. You are given the position, the move they played with the engine's continuation, and the engine's better move with its continuation. The engine lines are the only source of truth about what happens: explain what they show, and do not claim anything they do not show.

The card prints two sentences and you write the end of each:
- "<played move> was a blunder because ..." — bad: the one concrete thing that goes wrong in the engine's line (what is lost, what the opponent gets).
- "<better move> was the best move because ..." — better: what it does that the played move did not.

Each is one clause of at most 20 words, plain casual English, addressed to the player as "you". It continues the sentence: start lowercase, do not repeat the move the sentence opens with, do not write "because". Name the one or two moves that carry the point, not the whole line.

Rules: name only moves that appear in the lines you were given, written exactly as given. Check every piece and square you mention against the piece list. No evaluation numbers, no bold, no lists, no square brackets, no "the engine says".`;

const SCHEMA = {
	type: "object",
	properties: { bad: { type: "string" }, better: { type: "string" } },
	required: ["bad", "better"],
	additionalProperties: false
};

const prompt = ({ fens }, { ply, kind, move, better, followUp, evalBefore, evalAfter }) => {
	const player = move.color;
	return `Side to move: ${SIDE[player]} (the player)
Position before the move (FEN): ${fens[ply]}
${pieceList(fens[ply])}

The player's move, ${kind === "inaccuracy" ? "an" : "a"} ${kind}, and how the engine continues: ${describeLine([move, ...followUp], player)}
  Engine evaluation after it, from the player's side: ${evaluation(evalAfter, player)}

The engine's better move and its line: ${describeLine(better, player)}
  Engine evaluation, from the player's side: ${evaluation(evalBefore, player)}`;
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
			done({ bad: answer.bad, better: answer.better });
		} catch (error) {
			reject(new Error(`Claude: ${error.message}${err ? ` (${err.trim().slice(0, 200)})` : ""}`));
		}
	});
});

// Moves the prose names that are in neither line. Only what is unmistakably a
// move is read as one — a piece letter, a capture, castling — since a bare
// "e6" is as often a square as a pawn push.
const MOVE = /\b(?:[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|O-O(?:-O)?)/g;
const strayMoves = (text, { move, better, followUp }) => {
	const given = new Set([move, ...better, ...followUp].map(m => m.san.replace(/[+#]/g, "")));
	return (text.match(MOVE) ?? []).filter(san => !given.has(san));
}

// { bad, better } for one mistake, or null when the model could not be
// reached, did not answer, or twice wrote about moves it was not given: the
// card is still worth having without it
const explainMistake = async (game, mistake) => {
	try {
		for (let attempt = 0; attempt < 2; attempt++) {
			const why = await askClaude(prompt(game, mistake));
			const stray = strayMoves(`${why.bad} ${why.better}`, mistake);
			if (stray.length === 0) return why;
			console.error(`explain: named moves outside the lines (${stray.join(", ")})`);
		}
		return null;
	} catch (error) {
		console.error(`explain: ${error.message}`);
		return null;
	}
}

export { explainMistake, prompt }
