import { ttGenerateText } from "./tiptap-utility.js"
import { isValidFen } from "./isValidFen.js"
import { isSeen, cardsUnder } from "./subdecks.js"

// An intro is a page read before the first card of what it introduces: a
// deck's, or a subdeck's. It is stored as blocks, like a deck's description
// (text and boards), with headings among the text (tiptap-heading.js).
//
// Whether one has been read is not stored on the account. It comes up while
// nothing under it has been studied, and the browser remembers which ones
// were passed with study's Study button (the read marks, below).

// a contents list is worth having once a page has this many headings
const CONTENTS_FROM = 3;

// The page's headings in order, for its contents list: the ones that stand
// in the page's own text, not inside a list. One with no words in it is
// still counted (text ""), so a heading's place in this list is its place
// among the headings the page renders.
const introHeadings = blocks => (blocks ?? [])
	.filter(block => block.type === "text")
	.flatMap(block => block.content?.content ?? [])
	.filter(node => node.type === "heading")
	.map(node => ({ level: node.attrs?.level === 2 ? 2 : 1, text: ttGenerateText({ type: "doc", content: [node] }).trim() }));

// Whether a value is an intro as it is stored: blocks of text the editor's
// schema knows and of boards on a valid position. What the server takes is
// what study renders, for the owner and for whoever takes the deck from the
// marketplace, so anything else is turned away there.
const isBoard = board => board != null && typeof board === "object"
	&& typeof board.fen === "string" && isValidFen(board.fen)
	&& (board.moves == null || (Array.isArray(board.moves) && board.moves.every(move => typeof move === "string")));
const isIntroBlocks = value => {
	if (!Array.isArray(value)) return false;
	try {
		return value.every(block =>
			block?.type === "text"
				// an unknown node or mark throws
				? block.content?.type === "doc" && typeof ttGenerateText(block.content) === "string"
				: block?.type === "chessboards" && Array.isArray(block.content) && block.content.every(isBoard));
	} catch {
		return false;
	}
}

// What stands on the way to a subdeck, outermost first: the deck, then each
// subdeck down to it, each with the intro it has (blocks, or null). A deck
// that does not use its subdecks shows nothing of them, so it has only its
// own. key is what the place is known by: the deck's id, or the subdeck's.
// (A page with no blocks on it is no page.)
const blocksOf = holder => holder.intro?.length > 0 ? holder.intro : null;
const introPlaces = (deck, subdeckId = null) => {
	const places = [{ key: deck.id, name: deck.name, blocks: blocksOf(deck), subdeckId: null }];
	if (!deck.usesSubdecks || !subdeckId) return places;
	const byId = new Map(deck.subdecks.map(subdeck => [subdeck.id, subdeck]));
	const trail = [];
	for (let subdeck = byId.get(subdeckId); subdeck; subdeck = byId.get(subdeck.parent_id)) trail.unshift(subdeck);
	for (const subdeck of trail) {
		places.push({ key: subdeck.id, name: subdeck.name, blocks: blocksOf(subdeck), subdeckId: subdeck.id });
	}
	return places;
}

// whether what a place introduces has been begun: a card under it studied
const isBegun = (deck, cards, place) =>
	(place.subdeckId ? cardsUnder(deck.subdecks, cards, place.subdeckId) : cards).some(isSeen);

// The intro to read before a card of the subdeck is studied, the outermost
// first: one that has not been passed (read: the keys that were) and whose
// deck or subdeck has not been begun. null when there is none.
const pendingIntro = (deck, cards, subdeckId, read) =>
	introPlaces(deck, subdeckId)
		.find(place => place.blocks && !read.has(place.key) && !isBegun(deck, cards, place)) ?? null;

// --- the read marks ---
// The keys of the pages passed, as this browser remembers them. Only a page
// whose deck or subdeck has not been begun is ever asked about, so a mark
// matters from the Study button to the first grade. A deck reset forgets the
// deck's: its cards are new again, and its pages come up again.
const READ_KEY = "chesscards:intros-read";
const readMarks = () => {
	try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) ?? "[]")); }
	catch { return new Set(); }
}
const writeMarks = marks => {
	try { localStorage.setItem(READ_KEY, JSON.stringify([...marks])); } catch {}
}
const markIntroRead = key => writeMarks(readMarks().add(key));
const forgetIntrosRead = deck => {
	const marks = readMarks();
	for (const key of [deck.id, ...deck.subdecks.map(subdeck => subdeck.id)]) marks.delete(key);
	writeMarks(marks);
}

export { CONTENTS_FROM, introHeadings, isIntroBlocks, introPlaces, isBegun, pendingIntro, readMarks, markIntroRead, forgetIntrosRead }
