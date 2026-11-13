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
// reused: the deck among the decks at the top of My flashcards, a chapter
// among the decks inside the one that holds it (a chapter is a deck inside
// the spec's deck). Cards are matched by their spec "id" through a lockfile written
// beside the spec (caro-kann.json -> caro-kann.lock.json), so EDITING A CARD
// UPDATES IT IN PLACE and its FSRS history — due date, stability, review log —
// survives. Give every card a stable id and never recycle one.
//
// A card with no id, or an id not yet in the lockfile, is matched by an
// identical front instead, which lets a deck written before ids adopt them
// without losing anything. Failing both, it is inserted.
//
// Cards are positioned in spec order within their chapter, so reordering the
// spec reorders the chapter. The cards of the deck itself may be given as
// "cards" beside "chapters"; they come before the chapters' in study. A card
// dropped from the spec is reported and kept; --prune deletes it (and says
// so if it had been studied).
//
// Changing a card's "type" is the one edit that costs history: the
// only_basic_cards_have_fsrs_state constraint forces the schedule to reset.
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
// A chapter may hold chapters, as decks hold decks, and cards beside them
// (its own come first):
//
//   { "name": "Main Line", "chapters": [ { "name": "Overview", "cards": [...] }, ... ] }
//
// A chapter that already holds cards can be split this way: list its cards in
// its new chapters and they move there, history and all. Chapters stand in
// spec order among themselves, as cards do; a deck inside that the spec does
// not name keeps its place.
//
// The deck and any chapter may carry an intro: an Article (a first exposure
// article, the page study shows once, before the cards after it), made the
// first card of that deck, ahead of the spec's "cards":
//
//   "intro": [ "# Heading\n\ntext with [moves]", { "boards": [ <board> ] }, "more text" ]
//
// Text and boards in reading order, or one string for text alone. Text is
// written as a card side's is, and a line starting "# " or "## " is a
// heading. The boards count down the page; [moves](2) names the second, and
// with no number the board above the text (or the first below). Its id is
// "intro:" and the deck's name, or a chapter's names down from the deck
// ("intro:Chapter / Subchapter"). A card
// of type "article" anywhere among the cards is written the same way, as its
// front; an article has no back.
//
// <card> = {
//   "id":   "ov-first-moves",            // stable id; edits update in place
//   "type": "basic" | "tactic" | "article", // optional, default "basic"
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
if (spec.chapters != null && !Array.isArray(spec.chapters)) bad("spec: chapters must be a list")
if (spec.cards != null && !Array.isArray(spec.cards)) bad("spec: cards must be a list")
if (!(spec.chapters?.length > 0) && !(spec.cards?.length > 0)) bad("spec: no chapters and no cards")

// build + validate everything before touching the database
const specIds = new Set()
const buildCards = (cards, here) => (cards ?? []).map((card, i) => {
	const label = `"${here}" card ${i + 1}`
	if (card.keep != null) {
		if (typeof card.keep !== "string" || !/^[0-9a-f-]{36}$/i.test(card.keep)) bad(`${label}: keep must be a card's uuid`)
		return { keep: card.keep }
	}
	const type = card.type ?? "basic"
	if (!["basic", "tactic", "article"].includes(type)) bad(`${label}: unknown type "${type}"`)
	if (card.id != null) {
		if (typeof card.id !== "string" || !card.id.trim()) bad(`${label}: id must be a non-empty string`)
		else if (specIds.has(card.id)) bad(`${label}: duplicate id "${card.id}"`)
		else specIds.add(card.id)
	}
	if (type === "article") {
		if (card.back != null) bad(`${label}: an article has no back`)
		return { id: card.id ?? null, type, front: buildIntro(card.front, `${label} front`), back: null }
	}
	return { id: card.id ?? null, type, ...buildCard(card, label) }
})
// a deck's intro, as the article that is its first card
const withIntro = (holder, cards, here) =>
	holder.intro == null ? cards : [{ id: `intro:${here}`, type: "article", front: holder.intro }, ...cards]
// the chapters inside a deck or a chapter, their names said once among them
const buildChapters = (list, here, path) => {
	const names = new Set()
	for (const child of list ?? []) {
		if (names.has(child.name)) bad(`"${here}": two chapters named "${child.name}"`)
		names.add(child.name)
	}
	return (list ?? []).map((child, i) => buildChapter(child, i, path))
}
const buildChapter = (chapter, ci, path) => {
	if (!chapter.name?.trim()) bad(`${path}chapter ${ci + 1}: missing name`)
	const here = `${path}${chapter.name}`
	if (chapter.chapters != null && (!Array.isArray(chapter.chapters) || chapter.chapters.length === 0)) bad(`"${here}": chapters must be a non-empty list`)
	return {
		name: chapter.name,
		cards: buildCards(withIntro(chapter, chapter.cards ?? [], here), here),
		chapters: Array.isArray(chapter.chapters) ? buildChapters(chapter.chapters, here, `${here} / `) : []
	}
}
const root = { name: spec.deck, cards: buildCards(withIntro(spec, spec.cards ?? [], spec.deck), spec.deck), chapters: buildChapters(spec.chapters, spec.deck, "") }

const countCards = chapter => chapter.cards.length + chapter.chapters.reduce((n, c) => n + countCards(c), 0)
const total = countCards(root)

if (problems.length > 0) {
	console.error(`\n${problems.length} validation problem(s) — nothing written:\n`)
	for (const p of problems) console.error("  " + p)
	process.exit(1)
}

const pool = new pg.Pool()
const client = await pool.connect()
let inserted = 0, updated = 0, unchanged = 0, adopted = 0, retyped = 0, kept = 0, moved = 0
const pruned = []
const nextLock = { deck: spec.deck, cards: {} }
try {
	await client.query("begin")

	const email = spec.user ?? DEFAULT_USER_EMAIL
	const { rows: [user] } = await client.query('select id from "user" where email = $1', [email])
	if (!user) throw new Error(`no user with email ${email}`)

	// deck: reuse by name — the one at the top of the list, or the one of
	// that name wherever it was put — else create one at the end of the top
	// (where the user's decks and the marketplace decks they have taken share
	// the places)
	const { rows: named } = await client.query(
		"select id, name, position, parent_id from decks where user_id = $1 and name = $2 order by parent_id is not null",
		[user.id, spec.deck])
	if (named.length > 1 && named[0].parent_id != null)
		throw new Error(`${named.length} decks are named "${spec.deck}", none at the top: rename all but the one to import into`)
	let deck = named[0]
	const deckExisted = Boolean(deck)
	if (!deck) {
		({ rows: [deck] } = await client.query(`
			insert into decks(user_id, name, position) values($1, $2, (select coalesce(max(position), 0) + 1 from (
				select position from decks where user_id = $1 and parent_id is null
				union all
				select position from marketplace_deck_instances where user_id = $1 and parent_id is null) top))
			returning id, name, position`, [user.id, spec.deck]))
	}

	// every card under the deck, wherever inside it it stands
	const { rows: existingCards } = await client.query(`
		with recursive under(id) as (select $1::uuid union all select d.id from decks d join under on d.parent_id = under.id)
		select id, deck_id, position, front, back, card_type, reps from cards where deck_id in (select id from under)`, [deck.id])
	const byId = new Map(existingCards.map(c => [c.id, c]))
	// fallback match for cards that predate ids, or were added in the app
	const byFront = new Map()
	for (const c of existingCards) {
		const k = canonical(c.front)
		if (!byFront.has(k)) byFront.set(k, [])
		byFront.get(k).push(c)
	}
	const claimed = new Set()

	// a spec chapter is a deck inside the deck of the chapter that holds it
	// (the spec's deck at the top), matched by name among its siblings
	const childByName = async (parentId, name) => {
		const { rows: [found] } = await client.query(
			"select id, name, position from decks where user_id = $1 and parent_id = $2 and name = $3", [user.id, parentId, name])
		return found
	}

	// The cards of a deck in spec order, then its chapters.
	const importDeck = async (spot, target, depth) => {
		const indent = "  ".repeat(depth + 1)
		for (const [index, card] of spot.cards.entries()) {
			const position = index + 1

			// a card made by hand in the app: only its place is ours to set
			if (card.keep) {
				const own = byId.get(card.keep)
				if (!own) throw new Error(`"${spot.name}" card ${position}: no card ${card.keep} in this deck to keep`)
				claimed.add(own.id)
				kept++
				if (own.deck_id !== target.id || own.position !== position) {
					await client.query("update cards set deck_id=$2, position=$3 where id=$1", [own.id, target.id, position])
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
					&& row.deck_id === target.id
					&& row.position === position
				if (same) { unchanged++; continue }
				// a type flip must satisfy only_basic_cards_have_fsrs_state, which
				// means resetting the schedule — the one edit that costs history
				if (row.card_type !== card.type) {
					retyped++
					const fsrs = card.type === "basic"
						? Object.values(createEmptyCard())
						: [new Date(), null, null, null, null, null, null, null, null, null]
					await client.query(`update cards set front=$2, back=$3, card_type=$4, deck_id=$5, position=$6,
						due=$7, stability=$8, difficulty=$9, elapsed_days=$10, scheduled_days=$11,
						reps=$12, lapses=$13, learning_steps=$14, state=$15, last_review=$16 where id=$1`,
						[row.id, JSON.stringify(card.front), card.back ? JSON.stringify(card.back) : null,
							card.type, target.id, position, ...fsrs])
				} else {
					// content only: the FSRS columns are untouched, so the card
					// keeps its due date, stability and review history
					await client.query(
						"update cards set front=$2, back=$3, deck_id=$4, position=$5 where id=$1",
						[row.id, JSON.stringify(card.front), card.back ? JSON.stringify(card.back) : null,
							target.id, position])
				}
				updated++
				continue
			}

			const fsrs = card.type === "basic"
				? Object.values(createEmptyCard())
				: [new Date(), null, null, null, null, null, null, null, null, null]
			const { rows: [made] } = await client.query(`insert into cards(
					deck_id, position, front, back, card_type,
					due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, learning_steps, state, last_review)
				values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
				returning id`,
				[target.id, position, JSON.stringify(card.front),
					card.back ? JSON.stringify(card.back) : null, card.type, ...fsrs])
			claimed.add(made.id)
			if (card.id) nextLock.cards[card.id] = made.id
			inserted++
		}

		// the chapters inside it take spec order, sharing out the places they
		// already hold between them, so a deck made in the app is not pushed
		// aside
		const decks = []
		for (const chapter of spot.chapters) {
			let child = await childByName(target.id, chapter.name)
			if (!child) {
				({ rows: [child] } = await client.query(`
					insert into decks(user_id, name, parent_id, position)
					values ($1, $2, $3, (select coalesce(max(position), 0) + 1 from (
						select position from decks where parent_id = $3
						union all
						select position from marketplace_deck_instances where parent_id = $3) siblings))
					returning id, name, position`, [user.id, chapter.name, target.id]))
				console.log(`${indent}chapter "${chapter.name}" (new)`)
			} else {
				console.log(`${indent}chapter "${chapter.name}" (existing)`)
			}
			await importDeck(chapter, child, depth + 1)
			decks.push(child)
		}
		const places = decks.map(d => d.position).sort((a, b) => a - b)
		for (const [i, child] of decks.entries()) {
			if (child.position === places[i]) continue
			await client.query("update decks set position = $2 where id = $1", [child.id, places[i]])
			child.position = places[i]
		}
	}
	await importDeck(root, deck, 0)

	// cards this spec used to own but no longer lists (pruned before the
	// numbering below, which would otherwise count them among the cards)
	for (const [id, cardId] of Object.entries(lock.cards ?? {})) {
		if (specIds.has(id) || !byId.has(cardId)) continue
		const row = byId.get(cardId)
		pruned.push({ id, reps: row.reps })
		if (prune) await client.query("delete from cards where id = $1", [cardId])
		else nextLock.cards[id] = cardId
	}

	// a card the spec moved out of a deck leaves a gap behind it: every deck
	// under this one is numbered 1..n again, in the order its cards stand
	await client.query(`
		with recursive under(id) as (select $1::uuid union all select d.id from decks d join under on d.parent_id = under.id)
		update cards c set position = r.position
		from (select id, row_number() over (partition by deck_id order by position) position
			from cards where deck_id in (select id from under)) r
		where c.id = r.id and c.position <> r.position`, [deck.id])

	console.log(`\n${spec.deck}: ${inserted} new, ${updated} updated, ${unchanged} unchanged ` +
		`(${total} in spec, deck ${deckExisted ? "existed" : "created"})`)
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
