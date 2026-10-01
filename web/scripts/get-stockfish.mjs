// Fetches the official Stockfish release the game import analyses with — the
// same release Lichess's analysis clients are pinned to — into .stockfish/.
// Run from web/:  npm run stockfish
//
// Elsewhere (macOS, Windows) install Stockfish yourself and point
// STOCKFISH_PATH at the binary.
import { mkdirSync, writeFileSync, copyFileSync, chmodSync, rmSync, readdirSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { join } from "node:path"

const TAG = "sf_19"
const ASSETS = { "linux-x64": "stockfish-linux-x86-64-universal", "linux-arm64": "stockfish-linux-arm64-universal" }
const asset = ASSETS[`${process.platform}-${process.arch}`]
if (!asset) {
	console.error(`No official build is fetched for ${process.platform}-${process.arch}: install Stockfish and set STOCKFISH_PATH.`)
	process.exit(1)
}

const dir = ".stockfish"
mkdirSync(dir, { recursive: true })
const url = `https://github.com/official-stockfish/Stockfish/releases/download/${TAG}/${asset}.tar.gz`
console.log(`fetching ${url}`)
const response = await fetch(url)
if (!response.ok) throw new Error(`download failed: ${response.status}`)
const archive = join(dir, "stockfish.tar.gz")
writeFileSync(archive, Buffer.from(await response.arrayBuffer()))
execFileSync("tar", ["-xzf", archive, "-C", dir])
const unpacked = join(dir, "stockfish")
copyFileSync(join(unpacked, readdirSync(unpacked).find(name => name.startsWith("stockfish-"))), join(dir, "stockfish.bin"))
rmSync(unpacked, { recursive: true })
rmSync(archive)
// the archive's folder and the binary want the same name
execFileSync("mv", [join(dir, "stockfish.bin"), unpacked])
chmodSync(unpacked, 0o755)
console.log(`Stockfish ${TAG} is at ${unpacked}`)
