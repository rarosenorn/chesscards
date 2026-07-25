// Seeds the "Mating with king and rook" deck. Every FEN and move line is
// validated through chess.js before anything touches the database; claimed
// mates/stalemates are asserted. Run from web/: node scripts/seed-rook-mate-deck.mjs
import "dotenv/config"
import { Chess } from "chess.js"
import pg from "pg"

const USER_EMAIL = "rasmusrjakobsen@gmail.com"
const DECK_NAME = "Mating with king and rook"

// --- tiptap JSON helpers ---------------------------------------------------
const text = (t, marks) => ({ type: "text", text: t, ...(marks ? { marks } : {}) })
const bold = t => text(t, [{ type: "bold" }])
const p = (...content) => ({ type: "paragraph", content: content.map(c => typeof c === "string" ? text(c) : c) })
const doc = (...content) => ({ type: "doc", content })
const ol = items => ({
	type: "orderedList",
	content: items.map(item => ({ type: "listItem", content: [p(item)] }))
})

const textBlock = json => ({ type: "text", content: json })
const boardBlock = (...boards) => ({ type: "chessboards", content: boards })
const board = (fen, { moves = [], annotations = {}, orientation = "w" } = {}) =>
	({ fen, moves, annotations, orientation })

const arrow = (type, from, to) => ({ type, from, to })
const marker = (type, square) => ({ type, square })

// --- validation ------------------------------------------------------------
const fail = msg => { throw new Error("VALIDATION: " + msg) }

const validateBoard = (b, label) => {
	const chess = new Chess()
	try { chess.load(b.fen, { skipValidation: true }) } catch { fail(`${label}: bad fen ${b.fen}`) }
	for (const [i, san] of b.moves.entries()) {
		try { chess.move(san.replace(/^\.\.\./, "")) } catch { fail(`${label}: move ${i + 1} (${san}) illegal after ${chess.fen()}`) }
	}
	const last = b.moves.at(-1)
	if (last?.endsWith("#") && !chess.isCheckmate()) fail(`${label}: claimed mate is not mate`)
	if (b.expectStalemate && !chess.isStalemate()) fail(`${label}: claimed stalemate is not stalemate`)
	for (const [index, ann] of Object.entries(b.annotations)) {
		if (Number(index) > b.moves.length) fail(`${label}: annotation index ${index} beyond line`)
		for (const a of ann.arrows ?? []) if (!/^[a-h][1-8]$/.test(a.from + "") || !/^[a-h][1-8]$/.test(a.to + "")) fail(`${label}: bad arrow`)
	}
}

const stalemateBoard = (fen, opts) => { const b = board(fen, opts); b.expectStalemate = true; return b }

// --- the deck --------------------------------------------------------------
// Positions (all verified below):
const cards = [
	{
		type: "basic",
		front: [textBlock(doc(p("Mating with ", bold("king and rook"), " against a lone king: what are the three phases?")))],
		back: [textBlock(doc(
			ol([
				"Fence the enemy king in with the rook — “the box”.",
				"Shrink the box, square by square, until the king is pushed to an edge. Your own king escorts.",
				"Mate on the edge: kings in opposition, rook checks along the rim.",
			])
		))],
	},
	{
		type: "basic",
		front: [
			textBlock(doc(p("Which squares can the black king reach — and what is this region called?"))),
			boardBlock(board("8/8/8/4k3/8/2R5/8/6K1 w - - 0 1")),
		],
		back: [
			textBlock(doc(p("The rook’s file and rank are fences: the king is trapped in ", bold("the box"), " (d4–h8 here). The whole technique is shrinking it."))),
			boardBlock(board("8/8/8/4k3/8/2R5/8/6K1 w - - 0 1", {
				annotations: { 0: { arrows: [arrow("info", "c3", "c8"), arrow("info", "c3", "h3")] } },
			})),
		],
	},
	{
		type: "basic",
		front: [
			textBlock(doc(p("The black king sits far away. How does White make progress?"))),
			boardBlock(board("8/6k1/8/8/8/2R5/8/4K3 w - - 0 1")),
		],
		back: [
			textBlock(doc(p("Shrink the box whenever it’s safe — each rook step steals a slice. Here the rank-fence advances two rows."))),
			boardBlock(board("8/6k1/8/8/8/2R5/8/4K3 w - - 0 1", {
				moves: ["Rc5"],
				annotations: { 1: { arrows: [arrow("info", "c5", "c8"), arrow("info", "c5", "h5")] } },
			})),
		],
	},
	{
		type: "basic",
		front: [
			textBlock(doc(p("The rook alone can never deliver this mate. What is your king’s job?"))),
			boardBlock(board("8/3k4/8/3K4/7R/8/8/8 w - - 0 1")),
		],
		back: [textBlock(doc(p(
			bold("Escort duty."), " The rook only fences — the king pushes. Walk it up next to the box, shield the rook, and take the opposition so the enemy king must give ground."
		)))],
	},
	{
		type: "basic",
		front: [
			textBlock(doc(p("Black attacks your rook. Best response?"))),
			boardBlock(board("8/8/3k4/2R5/8/8/8/6K1 w - - 0 1")),
		],
		back: [
			textBlock(doc(p("Slide ", bold("along the fence"), ", far away. The box is unchanged — a rook fences as well from h5 as from c5 — and distance makes it untouchable."))),
			boardBlock(board("8/8/3k4/2R5/8/8/8/6K1 w - - 0 1", { moves: ["Rh5"] })),
		],
	},
	{
		type: "basic",
		front: [
			textBlock(doc(p("Black to move. Why is every black move a step toward mate?"))),
			boardBlock(board("1k6/7R/1K6/8/8/8/8/8 b - - 0 1")),
		],
		back: [
			textBlock(doc(p(
				bold("Zugzwang."), " With the kings in opposition, Black must step aside — into the corner it’s mate at once; the other way, White’s king simply mirrors the shuffle until the board runs out."
			))),
			boardBlock(board("1k6/7R/1K6/8/8/8/8/8 b - - 0 1", { moves: ["Ka8", "Rh8#"] })),
		],
	},
	{
		type: "basic",
		front: [textBlock(doc(p("Picture the final mate position — what three things does it need? Then check.")))],
		back: [
			textBlock(doc(p(
				bold("Edge + opposition + rim check."), " Enemy king on the rim, your king directly opposite (denying the three escape squares), rook sweeping the rim line."
			))),
			boardBlock(board("4k2R/8/4K3/8/8/8/8/8 b - - 0 1", {
				annotations: { 0: { arrows: [arrow("danger", "h8", "e8")], markers: [marker("info", "d7"), marker("info", "e7"), marker("info", "f7")] } },
			})),
		],
	},
	{
		type: "basic",
		front: [
			textBlock(doc(p("White just played Rb7 — what went wrong?"))),
			boardBlock(board("k7/1R6/2K5/8/8/8/8/8 b - - 0 1")),
		],
		back: [
			textBlock(doc(p(
				bold("Stalemate — draw."), " Not in check, no legal move: the rook seals b8 and the 7th rank, the king covers the rest. Near the end, always leave the defending king one move — or give mate instead."
			))),
			boardBlock(stalemateBoard("k7/1R6/2K5/8/8/8/8/8 b - - 0 1")),
		],
	},
	{
		type: "tactic",
		front: [
			textBlock(doc(p("White mates in one."))),
			boardBlock(board("4k3/8/4K3/8/8/8/8/7R w - - 0 1")),
		],
		back: [boardBlock(board("4k3/8/4K3/8/8/8/8/7R w - - 0 1", { moves: ["Rh8#"] }))],
	},
	{
		type: "tactic",
		front: [
			textBlock(doc(p("White mates in one."))),
			boardBlock(board("k7/8/1K6/8/8/8/8/7R w - - 0 1")),
		],
		back: [boardBlock(board("k7/8/1K6/8/8/8/8/7R w - - 0 1", { moves: ["Rh8#"] }))],
	},
	{
		type: "tactic",
		front: [
			textBlock(doc(p("White mates in one — the edge isn’t always the back rank."))),
			boardBlock(board("8/8/8/k1K5/8/8/8/7R w - - 0 1")),
		],
		back: [boardBlock(board("8/8/8/k1K5/8/8/8/7R w - - 0 1", { moves: ["Ra1#"] }))],
	},
	{
		type: "tactic",
		front: [
			textBlock(doc(p("One rook move mates, another draws on the spot. Find both."))),
			boardBlock(board("k7/6R1/1K6/8/8/8/8/8 w - - 0 1")),
		],
		back: [
			textBlock(doc(p(bold("Rg8#"), " mates along the rim. ", bold("Rb7??"), " is stalemate — the rook seals b8 and the 7th while the king covers a7 and b7: no check, no moves, draw."))),
			boardBlock(board("k7/6R1/1K6/8/8/8/8/8 w - - 0 1", { moves: ["Rg8#"] })),
			boardBlock(stalemateBoard("k7/6R1/1K6/8/8/8/8/8 w - - 0 1", { moves: ["Rb7"] })),
		],
	},
]

// --- validate everything ---------------------------------------------------
cards.forEach((card, ci) => {
	for (const side of ["front", "back"]) {
		for (const block of card[side]) {
			if (block.type === "chessboards") {
				block.content.forEach((b, bi) => validateBoard(b, `card ${ci + 1} ${side} board ${bi + 1}`))
			}
		}
	}
})
console.log("all positions and lines verified")

// strip validation-only fields before storage
const cleanSide = side => JSON.stringify(side.map(block =>
	block.type === "chessboards"
		? { type: "chessboards", content: block.content.map(({ fen, moves, annotations, orientation }) => ({ fen, moves, annotations, orientation })) }
		: block
))

// --- insert ----------------------------------------------------------------
const pool = new pg.Pool()
const client = await pool.connect()
try {
	await client.query("begin")
	const { rows: [user] } = await client.query('select id from "user" where email = $1', [USER_EMAIL])
	if (!user) fail("user not found")
	const { rows: [deck] } = await client.query(
		"insert into decks(user_id, name) values($1, $2) returning id", [user.id, DECK_NAME])
	for (const card of cards) {
		const isTactic = card.type === "tactic"
		await client.query(`
			insert into cards(deck_id, front, back, card_type, due, stability, difficulty,
				elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review)
			values($1, $2, $3, $4, now(), $5, $6, $7, $8, $9, $10, $11, $12, null)`,
			[deck.id, cleanSide(card.front), cleanSide(card.back), card.type,
				...(isTactic ? [null, null, null, null, null, null, null, null]
					: [0, 0, 0, 0, 0, 0, 0, 0])]
		)
	}
	await client.query("commit")
	console.log(`inserted deck "${DECK_NAME}" (${deck.id}) with ${cards.length} cards`)
} catch (e) {
	await client.query("rollback")
	throw e
} finally {
	client.release()
	await pool.end()
}
