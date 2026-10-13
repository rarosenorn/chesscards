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
// A chapter may hold chapters instead of cards — the deck's subdecks form a
// tree, and a subdeck holds either cards or subdecks, never both:
//
//   { "name": "Main Line", "chapters": [ { "name": "Overview", "cards": [...] }, ... ] }
//
// A chapter that already holds cards can be split this way: list its cards in
// its new subdecks and they move there, history and all. Chapters stand in
// spec order among themselves, as cards do; a subdeck the spec does not name
// keeps its place.
//
// The deck and any chapter may carry an intro, the page study shows before
// the first card there:
//
//   "intro": [ "# Heading\n\ntext with [moves]", { "boards": [ <board> ] }, "more text" ]
//
// Text and boards in reading order, or one string for text alone. Text is
// written as a card side's is, and a line starting "# " or "## " is a
// heading. The boards count down the page; [moves](2) names the second, and
// with no number the board above the text (or the first below). An intro the
// spec leaves out stays as it is in the deck; "intro": null takes it away.
//
// <card> = {
//   "id":   "ov-first-moves",            // stable id; edits update in place
//   "type": "basic" | "tactic",          // optional, default "basic"
//   "front": <side>,
//   "back":  <side>                      // optional
// }
//
// A chapter the user has also written cards in by hand takes those cards as
// place-holders, so the two kinds share one order:
//
//   { "keep": "<the card's uuid>", "note": "what it asks, for the reader" }
//
// Such a card is never read or written here: it only holds its place among
// the chapter's cards (and is moved to it if it stands elsewhere).
//
// <side> = {
//   "text": "paragraphs, blank-line separated. **bold** supported.
//            lines starting with '1. ' become an ordered list,
//            lines starting with '- ' a bullet list.
//            [moves] are wired to a board — see below.",
//   "boards": [ <board>, ... ]           // optional
// }
// A side may also be given as a bare string, meaning { text: <string> }.
//
// Moves in the text
// -----------------
// Square brackets make the moves inside them clickable: clicking one plays it
// on the card's board, which is what the card is about (tiptap-move-ref.js).
// Only moves the board does NOT already play become clickable — the ones it
// does are named by the move line under it, so they are written as prose and
// a run that starts on the line and leaves it is split where it leaves.
//
//   "[3.d4] attacks the e-pawn"      the moves leave the board's line at the
//                                    position the FIRST move's number names —
//                                    "3." white's third, "3..." black's — or
//                                    at the end of the line if it has none
//   "as after [2...Nc6]"             a move that replaces one of the line's own
//   "[8.Bxf7+ Kd7 9.Qe6#]"           moves already on the line: plain prose,
//                                    the board's own move line plays them
//   "[4...Nf6 5.Nxc6]"               write a line from its own first move, not
//                                    from the line's move before it: a line
//                                    opens on its first move, tinted on the
//                                    board
//   "[6.Bf4](2)"                     board 2, on a card with more than one
//                                    (boards are numbered front then back, as
//                                    the card numbers them)
//   "[4.d4 | 4...exd4 5.Nxd4]"       moves before the bar are played but not
//                                    written out — for prose that talks about
//                                    a position the answer's own move reaches
//
// A move that does not play from where it is hung fails validation, so the
// prose and the boards cannot drift apart unnoticed.
//
// <board> = {
//   "fen": "rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3",
//   "moves": ["e5", "Bf5"],              // SAN. "..." prefix = move by the
//                                        // side not to move; "e2-e4" coord
//                                        // form for moves chess.js refuses.
//   "orientation": "w" | "b",            // optional, default "w"
//   "solutionFrom": 1,                   // optional. moves[solutionFrom..] are
//                                        // hidden until the card is turned.
//   "openAt": 4,                         // optional ply the board opens at
//                                        // (default: the start)
//   "puzzle": true,                      // optional. in study the hidden moves
//                                        // are played on the board, not revealed
//   "arrows":  { "0": [["info","c1","h6"]] },   // keyed by ply index
//   "markers": { "0": [["success","e5"]] },
//   "solutionArrows": { ... }, "solutionMarkers": { ... }   // shown on turn
// }
// Arrow/marker types: success | warning | info | danger.

import "dotenv/config"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import pg from "pg"
import { createEmptyCard } from "ts-fsrs"
import { cardBuilder } from "../src/lib/card-spec.js"

const DEFAULT_USER_EMAIL = "rasmusrjakobsen@gmail.com"
const problems = []
const bad = msg => problems.push(msg)
const { buildCard, buildIntro } = cardBuilder(bad)

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
// undefined (not in the spec) is left alone, null removes
const introOf = (holder, label) => holder.intro == null ? holder.intro : buildIntro(holder.intro, label)
const deckIntro = introOf(spec, "deck intro")
const buildChapter = (chapter, ci, path) => {
	if (!chapter.name?.trim()) bad(`${path}chapter ${ci + 1}: missing name`)
	const here = `${path}${chapter.name}`
	const intro = introOf(chapter, `"${here}" intro`)
	if (chapter.chapters != null) {
		if (!Array.isArray(chapter.chapters) || chapter.chapters.length === 0) bad(`"${here}": chapters must be a non-empty list`)
		if ((chapter.cards ?? []).length > 0) bad(`"${here}": holds both cards and chapters — a subdeck holds one or the other`)
		const names = new Set()
		for (const child of chapter.chapters ?? []) {
			if (names.has(child.name)) bad(`"${here}": two chapters named "${child.name}"`)
			names.add(child.name)
		}
		return {
			name: chapter.name,
			intro,
			cards: [],
			chapters: (Array.isArray(chapter.chapters) ? chapter.chapters : []).map((child, i) => buildChapter(child, i, `${here} / `))
		}
	}
	return {
		name: chapter.name,
		intro,
		chapters: [],
		cards: (chapter.cards ?? []).map((card, i) => {
			const label = `"${here}" card ${i + 1}`
			if (card.keep != null) {
				if (typeof card.keep !== "string" || !/^[0-9a-f-]{36}$/i.test(card.keep)) bad(`${label}: keep must be a card's uuid`)
				return { keep: card.keep }
			}
			const type = card.type ?? "basic"
			if (!["basic", "tactic"].includes(type)) bad(`${label}: unknown type "${type}"`)
			if (card.id != null) {
				if (typeof card.id !== "string" || !card.id.trim()) bad(`${label}: id must be a non-empty string`)
				else if (specIds.has(card.id)) bad(`${label}: duplicate id "${card.id}"`)
				else specIds.add(card.id)
			}
			return { id: card.id ?? null, type, ...buildCard(card, label) }
		})
	}
}
const chapters = (spec.chapters ?? []).map((chapter, ci) => buildChapter(chapter, ci, ""))

const countCards = chapter => chapter.cards.length + chapter.chapters.reduce((n, c) => n + countCards(c), 0)
const total = chapters.reduce((n, c) => n + countCards(c), 0)

if (problems.length > 0) {
	console.error(`\n${problems.length} validation problem(s) — nothing written:\n`)
	for (const p of problems) console.error("  " + p)
	process.exit(1)
}

const pool = new pg.Pool()
const client = await pool.connect()
let inserted = 0, updated = 0, unchanged = 0, adopted = 0, retyped = 0, kept = 0, moved = 0, intros = 0
const pruned = []
const nextLock = { deck: spec.deck, cards: {} }
try {
	await client.query("begin")

	const email = spec.user ?? DEFAULT_USER_EMAIL
	const { rows: [user] } = await client.query('select id from "user" where email = $1', [email])
	if (!user) throw new Error(`no user with email ${email}`)

	// deck: reuse by name, else create (with its implicit first subdeck)
	let { rows: [deck] } = await client.query(
		"select id, intro from decks where user_id = $1 and name = $2", [user.id, spec.deck])
	const deckExisted = Boolean(deck)
	if (!deck) {
		// the implicit first subdeck is named for the spec's first chapter:
		// subdecks.name is NOT NULL, and the app names its own "Subdeck 1"
		({ rows: [deck] } = await client.query(`
			with d as (insert into decks(user_id, name) values($1, $2) returning id),
			s as (insert into subdecks(deck_id, name, position) select id, $3, 1 from d)
			select id from d`, [user.id, spec.deck, chapters[0].name]))
	}

	// an intro the spec names is written where it differs from the deck's
	const importIntro = async (table, row, intro, said) => {
		if (intro === undefined || canonical(row.intro ?? null) === canonical(intro)) return
		await client.query(`update ${table} set intro = $2 where id = $1`, [row.id, intro && JSON.stringify(intro)])
		console.log(`${said}: intro ${!intro ? "removed" : row.intro ? "updated" : "new"}`)
		intros++
	}
	await importIntro("decks", deck, deckIntro, `  deck "${spec.deck}"`)

	const { rows: existingCards } = await client.query(
		"select id, subdeck_id, position, front, back, card_type, reps from cards where deck_id = $1", [deck.id])
	const byId = new Map(existingCards.map(c => [c.id, c]))
	// fallback match for cards that predate ids, or were added in the app
	const byFront = new Map()
	for (const c of existingCards) {
		const k = canonical(c.front)
		if (!byFront.has(k)) byFront.set(k, [])
		byFront.get(k).push(c)
	}
	const claimed = new Set()

	// a spec chapter is a subdeck of the deck: top-level, or inside the subdeck
	// of the chapter that holds it. Matched by name among its siblings.
	const { rows: existingSubdecks } = await client.query(
		"select id, name, position, parent_id, intro from subdecks where deck_id = $1 order by position", [deck.id])
	const subdeckKey = (parentId, name) => `${parentId ?? ""}/${name}`
	const subdeckByName = new Map(existingSubdecks.filter(s => s.name).map(s => [subdeckKey(s.parent_id, s.name), s]))
	// legacy decks may still carry an unnamed subdeck; adopt it for the first
	// chapter (new decks get their first chapter's name at creation above)
	let unnamed = existingSubdecks.find(s => !s.name && s.parent_id == null) ?? null

	const importChapter = async (chapter, parentId, depth) => {
		const indent = "  ".repeat(depth + 1)
		let subdeck = subdeckByName.get(subdeckKey(parentId, chapter.name))
		if (!subdeck && unnamed && parentId == null) {
			await client.query("update subdecks set name = $2 where id = $1", [unnamed.id, chapter.name])
			subdeck = unnamed
			unnamed = null
			console.log(`${indent}chapter "${chapter.name}" (named the deck's first chapter)`)
		} else if (!subdeck) {
			({ rows: [subdeck] } = await client.query(`
				insert into subdecks(deck_id, name, parent_id, position)
				select $1, $2, $3, coalesce((select max(position) from subdecks
					where deck_id = $1 and parent_id is not distinct from $3), 0) + 1
				returning id, name, position, parent_id`, [deck.id, chapter.name, parentId]))
			console.log(`${indent}chapter "${chapter.name}" (new)`)
		} else {
			console.log(`${indent}chapter "${chapter.name}" (existing)`)
		}
		subdeckByName.set(subdeckKey(parentId, chapter.name), subdeck)
		await importIntro("subdecks", subdeck, chapter.intro, `${indent}  "${chapter.name}"`)

		if (chapter.chapters.length > 0) {
			await importChapters(chapter.chapters, subdeck.id, depth + 1)
			return subdeck
		}

		for (const [index, card] of chapter.cards.entries()) {
			const position = index + 1

			// a card made by hand in the app: only its place is ours to set
			if (card.keep) {
				const own = byId.get(card.keep)
				if (!own) throw new Error(`"${chapter.name}" card ${position}: no card ${card.keep} in this deck to keep`)
				claimed.add(own.id)
				kept++
				if (own.subdeck_id !== subdeck.id || own.position !== position) {
					await client.query("update cards set subdeck_id=$2, position=$3 where id=$1", [own.id, subdeck.id, position])
					moved++
				}
				continue
			}

			const frontKey = canonical(card.front)

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
					&& row.subdeck_id === subdeck.id
					&& row.position === position
				if (same) { unchanged++; continue }
				// a type flip must satisfy tactic_cards_have_no_fsrs_state, which
				// means resetting the schedule — the one edit that costs history
				if (row.card_type !== card.type) {
					retyped++
					const fsrs = card.type === "tactic"
						? [new Date(), null, null, null, null, null, null, null, null, null]
						: Object.values(createEmptyCard())
					await client.query(`update cards set front=$2, back=$3, card_type=$4, subdeck_id=$5, position=$6,
						due=$7, stability=$8, difficulty=$9, elapsed_days=$10, scheduled_days=$11,
						reps=$12, lapses=$13, learning_steps=$14, state=$15, last_review=$16 where id=$1`,
						[row.id, JSON.stringify(card.front), card.back ? JSON.stringify(card.back) : null,
							card.type, subdeck.id, position, ...fsrs])
				} else {
					// content only: the FSRS columns are untouched, so the card
					// keeps its due date, stability and review history
					await client.query(
						"update cards set front=$2, back=$3, subdeck_id=$4, position=$5 where id=$1",
						[row.id, JSON.stringify(card.front), card.back ? JSON.stringify(card.back) : null,
							subdeck.id, position])
				}
				updated++
				continue
			}

			const fsrs = card.type === "tactic"
				? [new Date(), null, null, null, null, null, null, null, null, null]
				: Object.values(createEmptyCard())
			const { rows: [made] } = await client.query(`insert into cards(
					deck_id, subdeck_id, position, front, back, card_type,
					due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review)
				values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
				returning id`,
				[deck.id, subdeck.id, position, JSON.stringify(card.front),
					card.back ? JSON.stringify(card.back) : null, card.type, ...fsrs])
			claimed.add(made.id)
			if (card.id) nextLock.cards[card.id] = made.id
			inserted++
		}
		return subdeck
	}
	// sibling chapters take spec order, sharing out the places they already
	// hold between them, so a subdeck made in the app is not pushed aside
	const importChapters = async (siblings, parentId, depth) => {
		const subdecks = []
		for (const chapter of siblings) subdecks.push(await importChapter(chapter, parentId, depth))
		const places = subdecks.map(s => s.position).sort((a, b) => a - b)
		for (const [i, subdeck] of subdecks.entries()) {
			if (subdeck.position === places[i]) continue
			await client.query("update subdecks set position = $2 where id = $1", [subdeck.id, places[i]])
			subdeck.position = places[i]
		}
	}
	await importChapters(chapters, null, 0)

	// a subdeck holds cards or subdecks, never both. Checked once every card
	// stands where the spec puts it, so a chapter being split into subdecks
	// passes as long as none of its cards is left behind
	const { rows: mixed } = await client.query(`
		select s.name from subdecks s where s.deck_id = $1
			and exists (select 1 from cards c where c.subdeck_id = s.id)
			and exists (select 1 from subdecks k where k.parent_id = s.id)`, [deck.id])
	if (mixed.length > 0)
		throw new Error(`${mixed.map(s => `"${s.name}"`).join(", ")} would hold both cards and subdecks`)

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
	if (intros > 0) console.log(`  ${intros} intro page(s) written`)
	if (kept > 0) console.log(`  ${kept} hand-made card(s) kept as they are` + (moved > 0 ? `, ${moved} of them moved to their place` : ""))
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
