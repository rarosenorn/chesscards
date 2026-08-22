// Imports a deck spec (JSON) into chesscards. Written for the /fcch skill, but
// usable by hand. Run from web/:
//
//   node scripts/import-deck.mjs ../specs/caro-kann.json            # dry run
//   node scripts/import-deck.mjs ../specs/caro-kann.json --apply    # write
//
// Nothing on the server validates card content (see src/routes/.../add-cards),
// so every check the browser normally performs happens here instead: strict
// FEN, chess.js replay of every SAN line, annotation bounds, solutionFrom
// bounds. A spec that fails validation writes nothing at all.
//
// Idempotent by design. The deck and its chapters are matched by name and
// reused. Cards are matched by their spec "id" through a lockfile written
// beside the spec (caro-kann.json -> caro-kann.lock.json), so EDITING A CARD
// UPDATES IT IN PLACE and its FSRS history — due date, stability, review log —
// survives. Give every card a stable id and never recycle one.
//
// A card with no id, or an id not yet in the lockfile, is matched by an
// identical front instead, which lets a deck written before ids adopt them
// without losing anything. Failing both, it is inserted.
//
// Cards are positioned in spec order within their chapter, so reordering the
// spec reorders the chapter. A card dropped from the spec is reported and
// kept; --prune deletes it (and says so if it had been studied).
//
// Changing a card's "type" is the one edit that costs history: the
// tactic_cards_have_no_fsrs_state constraint forces the schedule to reset.
//
// Spec format
// -----------
// {
//   "user": "someone@example.com",       // optional, defaults to USER_EMAIL
//   "deck": "Caro-Kann",
//   "chapters": [
//     { "name": "Advance Variation", "cards": [ <card>, ... ] },
//     ...
//   ]
// }
//
// <card> = {
//   "id":   "ov-first-moves",            // stable id; edits update in place
//   "type": "basic" | "tactic",          // optional, default "basic"
//   "front": <side>,
//   "back":  <side>                      // optional
// }
//
// <side> = {
//   "text": "paragraphs, blank-line separated. **bold** supported.
//            lines starting with '1. ' become an ordered list.",
//   "boards": [ <board>, ... ]           // optional
// }
// A side may also be given as a bare string, meaning { text: <string> }.
//
// <board> = {
//   "fen": "rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3",
//   "moves": ["e5", "Bf5"],              // SAN. "..." prefix = move by the
//                                        // side not to move; "e2-e4" coord
//                                        // form for moves chess.js refuses.
//   "orientation": "w" | "b",            // optional, default "w"
//   "solutionFrom": 1,                   // optional. moves[solutionFrom..] are
//                                        // hidden until the card is turned.
//   "arrows":  { "0": [["info","c1","h6"]] },   // keyed by ply index
//   "markers": { "0": [["success","e5"]] },
//   "solutionArrows": { ... }, "solutionMarkers": { ... }   // shown on turn
// }
// Arrow/marker types: success | warning | info | danger.

import "dotenv/config"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { Chess } from "chess.js"
import pg from "pg"
import { createEmptyCard } from "ts-fsrs"
import { isValidFen } from "../src/lib/isValidFen.js"

const DEFAULT_USER_EMAIL = "rasmusrjakobsen@gmail.com"
const ANNOTATION_TYPES = new Set(["success", "warning", "info", "danger"])
const SQUARE = /^[a-h][1-8]$/

// --- tiptap JSON -----------------------------------------------------------

const text = (t, marks) => ({ type: "text", text: t, ...(marks ? { marks } : {}) })
const paragraph = content => ({ type: "paragraph", content })

// **bold** -> bold marks; everything else is plain text
const inline = str => {
	const nodes = []
	for (const [i, part] of str.split(/\*\*/).entries()) {
		if (part === "") continue
		nodes.push(i % 2 === 1 ? text(part, [{ type: "bold" }]) : text(part))
	}
	return nodes.length > 0 ? nodes : [text("")]
}

// blank-line separated paragraphs; a run of "1. " lines becomes an orderedList
const textDoc = str => {
	const content = []
	for (const chunk of str.trim().split(/\n\s*\n/)) {
		const lines = chunk.split("\n").map(l => l.trim()).filter(Boolean)
		if (lines.length > 0 && lines.every(l => /^\d+\.\s+/.test(l))) {
			content.push({
				type: "orderedList",
				content: lines.map(l => ({
					type: "listItem",
					content: [paragraph(inline(l.replace(/^\d+\.\s+/, "")))]
				}))
			})
		} else {
			content.push(paragraph(inline(lines.join(" "))))
		}
	}
	return { type: "doc", content }
}

// --- validation ------------------------------------------------------------

const problems = []
const bad = msg => problems.push(msg)

const annotationLayer = (spec, board, label, kind) => {
	const layer = {}
	const add = (key, index, entry) => {
		const i = Number(index)
		if (!Number.isInteger(i) || i < 0 || i > board.moves.length)
			return bad(`${label}: ${kind} index ${index} outside line (0..${board.moves.length})`)
		layer[i] ??= {}
		layer[i][key] ??= []
		layer[i][key].push(entry)
	}
	for (const [index, arrows] of Object.entries(spec.arrows ?? {}))
		for (const [type, from, to] of arrows) {
			if (!ANNOTATION_TYPES.has(type)) bad(`${label}: unknown arrow type "${type}"`)
			if (!SQUARE.test(from) || !SQUARE.test(to)) bad(`${label}: bad arrow ${from}-${to}`)
			add("arrows", index, { type, from, to })
		}
	for (const [index, markers] of Object.entries(spec.markers ?? {}))
		for (const [type, square] of markers) {
			if (!ANNOTATION_TYPES.has(type)) bad(`${label}: unknown marker type "${type}"`)
			if (!SQUARE.test(square)) bad(`${label}: bad marker square ${square}`)
			add("markers", index, { type, square })
		}
	return layer
}

const buildBoard = (spec, label) => {
	if (typeof spec === "string") spec = { fen: spec }
	const { fen, moves = [], orientation = "w", solutionFrom = null } = spec

	if (typeof fen !== "string" || !isValidFen(fen)) bad(`${label}: invalid FEN ${JSON.stringify(fen)}`)
	if (!["w", "b"].includes(orientation)) bad(`${label}: orientation must be "w" or "b"`)

	// replay the line exactly as the app will
	const chess = new Chess()
	let replayed = true
	try { chess.load(fen, { skipValidation: true }) } catch { replayed = false }
	if (replayed) {
		for (const [i, san] of moves.entries()) {
			if (/^[a-h][1-8]-[a-h][1-8]$/.test(san)) { replayed = false; break }  // manual coord form: not replayable
			try { chess.move(san.replace(/^\.\.\./, "")) }
			catch { bad(`${label}: move ${i + 1} (${san}) is illegal after ${chess.fen()}`); replayed = false; break }
		}
	}
	if (replayed) {
		const last = moves.at(-1)
		if (last?.endsWith("#") && !chess.isCheckmate()) bad(`${label}: "${last}" is marked mate but is not mate`)
		if (last?.endsWith("+") && !chess.isCheck()) bad(`${label}: "${last}" is marked check but is not check`)
	}

	if (solutionFrom != null) {
		if (!Number.isInteger(solutionFrom) || solutionFrom < 0 || solutionFrom > moves.length)
			bad(`${label}: solutionFrom ${solutionFrom} outside 0..${moves.length}`)
		else if (solutionFrom === moves.length)
			bad(`${label}: solutionFrom ${solutionFrom} hides nothing — the whole line is already visible`)
	}

	const built = { fen, moves, orientation }
	const annotations = annotationLayer(spec, built, label, "annotation")
	const solutionAnnotations = annotationLayer(
		{ arrows: spec.solutionArrows, markers: spec.solutionMarkers }, built, label, "solution annotation")

	return {
		fen, moves, annotations, orientation,
		...(solutionFrom != null && { solutionFrom }),
		...(Object.keys(solutionAnnotations).length > 0 && { solutionAnnotations })
	}
}

const buildSide = (spec, label) => {
	if (spec == null) return null
	if (typeof spec === "string") spec = { text: spec }
	const blocks = []
	if (spec.text?.trim()) blocks.push({ type: "text", content: textDoc(spec.text) })
	const boards = (spec.boards ?? []).map((b, i) => buildBoard(b, `${label} board ${i + 1}`))
	if (boards.length > 0) blocks.push({ type: "chessboards", content: boards })
	if (blocks.length === 0) bad(`${label}: empty — needs text or at least one board`)
	return blocks
}

// jsonb does not preserve key order, so compare canonically (mirrors
// canonicalSideJson in the add-cards page, which drives its duplicate warning)
const canonical = value =>
	Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
		: value && typeof value === "object"
			? `{${Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",")}}`
			: JSON.stringify(value ?? null)

// --- main ------------------------------------------------------------------

const [, , specPath, ...flags] = process.argv
const apply = flags.includes("--apply")
const prune = flags.includes("--prune")
if (!specPath) {
	console.error("usage: node scripts/import-deck.mjs <spec.json> [--apply] [--prune]")
	process.exit(2)
}

const specFile = resolve(specPath)
const lockFile = specFile.replace(/\.json$/, "") + ".lock.json"
const spec = JSON.parse(readFileSync(specFile, "utf8"))
// id -> card uuid, so an edited card updates in place instead of being
// re-inserted; a card studied for months keeps its whole FSRS history
const lock = existsSync(lockFile) ? JSON.parse(readFileSync(lockFile, "utf8")) : { deck: spec.deck, cards: {} }

if (!spec.deck?.trim()) bad("spec: missing deck name")
if (!Array.isArray(spec.chapters) || spec.chapters.length === 0) bad("spec: no chapters")

// build + validate everything before touching the database
const specIds = new Set()
const chapters = (spec.chapters ?? []).map((chapter, ci) => {
	if (!chapter.name?.trim()) bad(`chapter ${ci + 1}: missing name`)
	return {
		name: chapter.name,
		cards: (chapter.cards ?? []).map((card, i) => {
			const label = `"${chapter.name}" card ${i + 1}`
			const type = card.type ?? "basic"
			if (!["basic", "tactic"].includes(type)) bad(`${label}: unknown type "${type}"`)
			if (card.id != null) {
				if (typeof card.id !== "string" || !card.id.trim()) bad(`${label}: id must be a non-empty string`)
				else if (specIds.has(card.id)) bad(`${label}: duplicate id "${card.id}"`)
				else specIds.add(card.id)
			}
			return { id: card.id ?? null, type, front: buildSide(card.front, `${label} front`), back: buildSide(card.back, `${label} back`) }
		})
	}
})

const total = chapters.reduce((n, c) => n + c.cards.length, 0)

if (problems.length > 0) {
	console.error(`\n${problems.length} validation problem(s) — nothing written:\n`)
	for (const p of problems) console.error("  " + p)
	process.exit(1)
}

const pool = new pg.Pool()
const client = await pool.connect()
let inserted = 0, updated = 0, unchanged = 0, adopted = 0, retyped = 0
const pruned = []
const nextLock = { deck: spec.deck, cards: {} }
try {
	await client.query("begin")

	const email = spec.user ?? DEFAULT_USER_EMAIL
	const { rows: [user] } = await client.query('select id from "user" where email = $1', [email])
	if (!user) throw new Error(`no user with email ${email}`)

	// deck: reuse by name, else create (with its implicit first stage)
	let { rows: [deck] } = await client.query(
		"select id from decks where user_id = $1 and name = $2", [user.id, spec.deck])
	const deckExisted = Boolean(deck)
	if (!deck) {
		({ rows: [deck] } = await client.query(`
			with d as (insert into decks(user_id, name) values($1, $2) returning id),
			s as (insert into stages(deck_id, position) select id, 1 from d)
			select id from d`, [user.id, spec.deck]))
	}

	const { rows: existingCards } = await client.query(
		"select id, stage_id, position, front, back, card_type, reps from cards where deck_id = $1", [deck.id])
	const byId = new Map(existingCards.map(c => [c.id, c]))
	// fallback match for cards that predate ids, or were added in the app
	const byFront = new Map()
	for (const c of existingCards) {
		const k = canonical(c.front)
		if (!byFront.has(k)) byFront.set(k, [])
		byFront.get(k).push(c)
	}
	const claimed = new Set()

	const { rows: existingStages } = await client.query(
		"select id, name, position from stages where deck_id = $1 order by position", [deck.id])
	const stageByName = new Map(existingStages.filter(s => s.name).map(s => [s.name, s]))
	// a brand-new deck has one unnamed stage; adopt it for the first chapter
	let unnamed = existingStages.find(s => !s.name) ?? null

	for (const chapter of chapters) {
		let stage = stageByName.get(chapter.name)
		if (!stage && unnamed) {
			await client.query("update stages set name = $2 where id = $1", [unnamed.id, chapter.name])
			stage = unnamed
			unnamed = null
			console.log(`  chapter "${chapter.name}" (named the deck's first chapter)`)
		} else if (!stage) {
			({ rows: [stage] } = await client.query(`
				insert into stages(deck_id, name, position)
				select $1, $2, coalesce((select max(position) from stages where deck_id = $1), 0) + 1
				returning id, name, position`, [deck.id, chapter.name]))
			console.log(`  chapter "${chapter.name}" (new)`)
		} else {
			console.log(`  chapter "${chapter.name}" (existing)`)
		}
		stageByName.set(chapter.name, stage)

		for (const [index, card] of chapter.cards.entries()) {
			const frontKey = canonical(card.front)
			const position = index + 1

			// find the row this spec card already owns: by id via the lockfile,
			// else by an identical front (adopting a card written before ids)
			let row = card.id && lock.cards[card.id] ? byId.get(lock.cards[card.id]) : null
			if (!row) {
				const candidate = (byFront.get(frontKey) ?? []).find(c => !claimed.has(c.id))
				if (candidate) { row = candidate; if (card.id) adopted++ }
			}

			if (row) {
				claimed.add(row.id)
				if (card.id) nextLock.cards[card.id] = row.id
				const same = canonical(row.front) === frontKey
					&& canonical(row.back) === canonical(card.back)
					&& row.card_type === card.type
					&& row.stage_id === stage.id
					&& row.position === position
				if (same) { unchanged++; continue }
				// a type flip must satisfy tactic_cards_have_no_fsrs_state, which
				// means resetting the schedule — the one edit that costs history
				if (row.card_type !== card.type) {
					retyped++
					const fsrs = card.type === "tactic"
						? [new Date(), null, null, null, null, null, null, null, null, null]
						: Object.values(createEmptyCard())
					await client.query(`update cards set front=$2, back=$3, card_type=$4, stage_id=$5, position=$6,
						due=$7, stability=$8, difficulty=$9, elapsed_days=$10, scheduled_days=$11,
						reps=$12, lapses=$13, learning_steps=$14, state=$15, last_review=$16 where id=$1`,
						[row.id, JSON.stringify(card.front), card.back ? JSON.stringify(card.back) : null,
							card.type, stage.id, position, ...fsrs])
				} else {
					// content only: the FSRS columns are untouched, so the card
					// keeps its due date, stability and review history
					await client.query(
						"update cards set front=$2, back=$3, stage_id=$4, position=$5 where id=$1",
						[row.id, JSON.stringify(card.front), card.back ? JSON.stringify(card.back) : null,
							stage.id, position])
				}
				updated++
				continue
			}

			const fsrs = card.type === "tactic"
				? [new Date(), null, null, null, null, null, null, null, null, null]
				: Object.values(createEmptyCard())
			const { rows: [made] } = await client.query(`insert into cards(
					deck_id, stage_id, position, front, back, card_type,
					due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review)
				values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
				returning id`,
				[deck.id, stage.id, position, JSON.stringify(card.front),
					card.back ? JSON.stringify(card.back) : null, card.type, ...fsrs])
			claimed.add(made.id)
			if (card.id) nextLock.cards[card.id] = made.id
			inserted++
		}
	}

	// cards this spec used to own but no longer lists
	for (const [id, cardId] of Object.entries(lock.cards ?? {})) {
		if (specIds.has(id) || !byId.has(cardId)) continue
		const row = byId.get(cardId)
		pruned.push({ id, reps: row.reps })
		if (prune) await client.query("delete from cards where id = $1", [cardId])
		else nextLock.cards[id] = cardId
	}

	console.log(`\n${spec.deck}: ${inserted} new, ${updated} updated, ${unchanged} unchanged ` +
		`(${total} in spec, deck ${deckExisted ? "existed" : "created"})`)
	if (adopted > 0) console.log(`  ${adopted} pre-existing card(s) adopted by id — their history is preserved`)
	if (retyped > 0) console.log(`  ${retyped} card(s) changed type, which resets their schedule`)
	if (pruned.length > 0) {
		console.log(`  ${pruned.length} card(s) dropped from the spec but still in the deck` +
			(prune ? " — deleted" : " — kept; re-run with --prune to delete"))
		for (const p of pruned) console.log(`    ${p.id}${p.reps > 0 ? ` (studied, ${p.reps} reviews)` : ""}`)
	}

	if (apply) {
		await client.query("commit")
		writeFileSync(lockFile, JSON.stringify(nextLock, null, 2) + "\n")
		console.log(`committed. ids -> ${lockFile.split("/").pop()}`)
	} else {
		await client.query("rollback")
		console.log("DRY RUN — rolled back. Re-run with --apply to write.")
	}
} catch (e) {
	await client.query("rollback")
	console.error("failed, rolled back:", e.message)
	process.exitCode = 1
} finally {
	client.release()
	await pool.end()
}
