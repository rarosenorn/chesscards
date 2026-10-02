import { Chess } from "chess.js"
import { isValidFen } from "./isValidFen.js"
import { replayMoves, looseChess } from "./board-utils.js"
import { parseAside, moveRefContent } from "./tiptap-move-ref.js"

// A card written as a spec — text with [moves], boards as FEN + SAN — built
// into the blocks the app stores. The spec format is documented at the top of
// scripts/import-deck.mjs, which was this code's first home; the game import
// builds its cards through the same door, so there is one definition of what
// a card's JSON looks like.
//
// Nothing on the server validates card content, so every check the browser
// normally performs happens here: strict FEN, chess.js replay of every SAN
// line, annotation bounds, solutionFrom bounds. `bad` is told each problem;
// the caller decides what a problem costs.
export const cardBuilder = bad => {
	const ANNOTATION_TYPES = new Set(["success", "warning", "info", "danger"])
	const SQUARE = /^[a-h][1-8]$/

	// --- tiptap JSON -----------------------------------------------------------

	const text = (t, marks) => ({ type: "text", text: t, ...(marks ? { marks } : {}) })
	const paragraph = content => ({ type: "paragraph", content })

	// **bold** -> bold marks; everything else is plain text
	const bolded = str => {
		const nodes = []
		for (const [i, part] of str.split(/\*\*/).entries()) {
			if (part === "") continue
			nodes.push(i % 2 === 1 ? text(part, [{ type: "bold" }]) : text(part))
		}
		return nodes
	}

	// [moves] and [moves](board): moves the reader can click, wired to the board
	// they are about
	const MOVE_REF = /\[([^\][]+)\](?:\((\d+)\))?/g

	// Where a written aside leaves the board's line: the number its first move
	// carries ("3..." is black's third), or the end of the line when it carries
	// none. The line's own numbering is used, so a board that starts mid-game
	// counts as it does.
	const branchPly = (written, line, label) => {
		const match = /^(\d+)(\.{2,3}|…)?/.exec(written.trim().split(/\s+/)[0] ?? "")
		if (!match) return line.moveInfos.length
		const number = Number(match[1])
		const color = match[2] ? "b" : "w"
		const at = line.moveInfos.findIndex(info => info.number === number && info.color === color)
		if (at >= 0) return at
		try {
			// past the last move: the position the line leaves off in
			const end = looseChess(line.fens.at(-1))
			if (end.moveNumber() === number && end.turn() === color) return line.moveInfos.length
		} catch { /* an invalid FEN is already reported by buildBoard */ }
		bad(`${label}: [${written}] — the board's line has no move ${number}${color === "b" ? "..." : "."} to hang them off`)
		return null
	}

	const moveRefNodes = (raw, boardNumber, ctx) => {
		const { label, boards } = ctx
		const bar = raw.indexOf("|")
		const lead = bar < 0 ? "" : raw.slice(0, bar).trim()
		const written = `${lead} ${bar < 0 ? raw : raw.slice(bar + 1)}`.trim()
		const board = boardNumber == null ? boards[0] : boards.find(b => b.number === boardNumber)
		if (!board) {
			bad(`${label}: [${raw}] names board ${boardNumber ?? 1}, which the card does not have`)
			return [text(raw)]
		}
		const line = replayMoves(board)
		const from = branchPly(written, line, label)
		if (from == null) return [text(raw)]
		const parsed = parseAside(line.fens[from], written)
		if (parsed.error) {
			bad(`${label}: [${raw}] — ${parsed.error} does not play after ${line.fens[from]}`)
			return [text(raw)]
		}
		if (parsed.moves.length === 0) {
			bad(`${label}: [${raw}] — no moves in the brackets`)
			return [text(raw)]
		}
		return moveRefContent({
			board: board.number,
			from,
			moves: parsed.moves,
			infos: parsed.infos,
			line: line.moveInfos.map(info => info.san),
			hidden: lead ? parseAside(line.fens[from], lead).moves.length : 0
		})
	}

	const inline = (str, ctx) => {
		const nodes = []
		let last = 0
		for (const match of str.matchAll(MOVE_REF)) {
			if (match.index > last) nodes.push(...bolded(str.slice(last, match.index)))
			nodes.push(...moveRefNodes(match[1], match[2] ? Number(match[2]) : null, ctx))
			last = match.index + match[0].length
		}
		if (last < str.length) nodes.push(...bolded(str.slice(last)))
		return nodes.length > 0 ? nodes : [text("")]
	}

	// blank-line separated paragraphs; a run of "1. " lines becomes an
	// orderedList, a run of "- " lines a bulletList
	const textDoc = (str, ctx) => {
		const content = []
		for (const chunk of str.trim().split(/\n\s*\n/)) {
			const lines = chunk.split("\n").map(l => l.trim()).filter(Boolean)
			if (lines.length > 0 && lines.every(l => /^-\s+/.test(l))) {
				content.push({
					type: "bulletList",
					content: lines.map(l => ({
						type: "listItem",
						content: [paragraph(inline(l.replace(/^-\s+/, ""), ctx))]
					}))
				})
			} else if (lines.length > 0 && lines.every(l => /^\d+\.\s+/.test(l))) {
				content.push({
					type: "orderedList",
					content: lines.map(l => ({
						type: "listItem",
						content: [paragraph(inline(l.replace(/^\d+\.\s+/, ""), ctx))]
					}))
				})
			} else {
				content.push(paragraph(inline(lines.join(" "), ctx)))
			}
		}
		return { type: "doc", content }
	}

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
		const { fen, moves = [], orientation = "w", solutionFrom = null, openAt = null, puzzle = false } = spec

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

		if (openAt != null && (!Number.isInteger(openAt) || openAt < 0 || openAt > moves.length))
			bad(`${label}: openAt ${openAt} outside 0..${moves.length}`)

		const built = { fen, moves, orientation }
		const annotations = annotationLayer(spec, built, label, "annotation")
		const solutionAnnotations = annotationLayer(
			{ arrows: spec.solutionArrows, markers: spec.solutionMarkers }, built, label, "solution annotation")

		return {
			fen, moves, annotations, orientation,
			...(solutionFrom != null && { solutionFrom }),
			...(puzzle && solutionFrom != null && { puzzle: true }),
			...(openAt != null && { openAt }),
			...(Object.keys(solutionAnnotations).length > 0 && { solutionAnnotations })
		}
	}

	const sideSpec = spec => spec == null ? null : typeof spec === "string" ? { text: spec } : spec

	const buildSide = (spec, label, boards, cardBoards) => {
		if (spec == null) return null
		const blocks = []
		if (spec.text?.trim()) blocks.push({ type: "text", content: textDoc(spec.text, { label, boards: cardBoards }) })
		if (boards.length > 0) blocks.push({ type: "chessboards", content: boards })
		if (blocks.length === 0) bad(`${label}: empty — needs text or at least one board`)
		return blocks
	}

	// A card's boards are built before either side's text, since the text of one
	// side may point at a board on the other, and both count from the same
	// numbering the card shows.
	const buildCard = (card, label) => {
		const front = sideSpec(card.front)
		const back = sideSpec(card.back)
		const build = (spec, sideLabel) =>
			(spec?.boards ?? []).map((b, i) => buildBoard(b, `${sideLabel} board ${i + 1}`))
		const frontBoards = build(front, `${label} front`)
		const backBoards = build(back, `${label} back`)
		const cardBoards = [...frontBoards, ...backBoards].map((board, i) => ({ ...board, number: i + 1 }))
		return {
			front: buildSide(front, `${label} front`, frontBoards, cardBoards),
			back: buildSide(back, `${label} back`, backBoards, cardBoards)
		}
	}

	return { buildCard }
}
