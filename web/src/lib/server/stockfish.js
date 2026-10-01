import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { availableParallelism } from "node:os"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

// Stockfish as Lichess's server analysis runs it: the official engine with
// its full network, one thread per search, a fixed number of nodes per
// position (lila's Work.Origin.manualRequest is 1,000,000). The engines are
// separate processes, so a search never holds up the web server's own work.
//
// STOCKFISH_PATH names the binary; `npm run stockfish` fetches the official
// release to the default place.
const BINARY = process.env.STOCKFISH_PATH ?? resolve(".stockfish/stockfish");
const NODES = Number(process.env.STOCKFISH_NODES ?? 1_000_000);
// a search per core that is really there: the second thread of a core adds
// little to an engine, and the web server wants room of its own
const WORKERS = Number(process.env.STOCKFISH_WORKERS ?? Math.max(1, Math.floor(availableParallelism() / 2)));
// far past what a search of NODES takes anywhere; an engine silent for this
// long is not coming back
const SEARCH_TIMEOUT = 120_000;

const isInstalled = () => existsSync(BINARY);

const startEngine = async () => {
	const proc = spawn(BINARY, [], { stdio: ["pipe", "pipe", "ignore"] });
	let onLine = () => {};
	let failed = null;
	let onFail = () => {};
	const fail = error => { failed ??= error; onFail(failed); };
	proc.on("error", fail);
	proc.on("exit", code => fail(new Error(`Stockfish exited (${code})`)));
	proc.stdin.on("error", fail);
	createInterface({ input: proc.stdout }).on("line", line => onLine(line));

	const send = command => proc.stdin.write(command + "\n");
	// everything the engine says from the command up to the line that ends it
	const until = (command, isLast) => new Promise((done, reject) => {
		if (failed) return reject(failed);
		const lines = [];
		const timer = setTimeout(() => { proc.kill("SIGKILL"); reject(new Error("Stockfish stopped answering")); }, SEARCH_TIMEOUT);
		const finish = fn => value => { clearTimeout(timer); onLine = () => {}; onFail = () => {}; fn(value); };
		onFail = finish(reject);
		onLine = line => { lines.push(line); if (isLast(line)) finish(done)(lines); };
		send(command);
	});

	await until("uci", line => line === "uciok");
	send("setoption name Threads value 1");
	send("setoption name Hash value 64");
	await until("isready", line => line === "readyok");

	return {
		newGame: () => send("ucinewgame"),
		quit: () => { onFail = () => {}; proc.kill(); },
		// the engine on one position: { cp | mate, pv } from White's side
		async search(fen) {
			send(`position fen ${fen}`);
			const lines = await until(`go nodes ${NODES}`, line => line.startsWith("bestmove"));
			// the last full line of thought; a bound is a search still
			// narrowing, not its answer
			const info = lines.findLast(line =>
				line.startsWith("info") && / score (cp|mate) /.test(line) && line.includes(" pv ") && !/ (upper|lower)bound/.test(line));
			if (!info) return null;
			const [, unit, value] = / score (cp|mate) (-?\d+)/.exec(info);
			const white = fen.split(" ")[1] === "w" ? 1 : -1;
			return { [unit]: white * Number(value), pv: info.split(" pv ")[1].trim().split(/\s+/) };
		}
	};
}

// Every position of a game, in order. The game is cut into one run of
// consecutive positions per engine, each searched last to first: what an
// engine learned about a position is in its hash when it reaches the one
// before, which is how Lichess's own clients go about it. `skip` are the
// indexes not worth a search (a position with no legal move).
const analysePositions = async (fens, { skip = [], onProgress = () => {} } = {}) => {
	const todo = fens.map((_, i) => i).filter(i => !skip.includes(i));
	const evals = new Array(fens.length).fill(null);
	const runs = Math.min(WORKERS, todo.length);
	const size = Math.ceil(todo.length / runs);
	let done = 0;
	const engines = [];
	let stopped = false;
	try {
		await Promise.all(Array.from({ length: runs }, async (_, run) => {
			const engine = await startEngine();
			// another run already failed while this engine was starting
			if (stopped) return engine.quit();
			engines.push(engine);
			engine.newGame();
			for (const i of todo.slice(run * size, (run + 1) * size).reverse()) {
				evals[i] = await engine.search(fens[i]);
				done += 1;
				onProgress(done, todo.length);
			}
		}));
	} finally {
		stopped = true;
		for (const engine of engines) engine.quit();
	}
	return evals;
}

export { analysePositions, isInstalled, BINARY }
