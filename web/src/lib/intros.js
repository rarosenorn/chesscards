import { ttGenerateText } from "./tiptap-utility.js"
import { isSeen, cardsUnder } from "./subdecks.js"

// An intro is a page read before the first card of what it introduces: a
// deck's, or a subdeck's. It is stored as blocks, like a deck's description
// (text and boards), with headings among the text (tiptap-heading.js).
//
// Whether one has been read is not stored on the account. It comes up while
// nothing under it has been studied, and study remembers in the browser
// which ones were passed with its Study button (Study.svelte).

// a contents list is worth having once a page has this many headings
const CONTENTS_FROM = 3;

// the page's headings in order, for its contents list
const introHeadings = blocks => (blocks ?? [])
	.filter(block => block.type === "text")
	.flatMap(block => block.content?.content ?? [])
	.filter(node => node.type === "heading")
	.map(node => ({ level: node.attrs?.level ?? 1, text: ttGenerateText({ type: "doc", content: [node] }).trim() }));

// What stands on the way to a subdeck, outermost first: the deck, then each
// subdeck down to it, each with the intro it has (blocks, or null). A deck
// that does not use its subdecks shows nothing of them, so it has only its
// own. key is what the place is known by: the deck's id, or the subdeck's.
const introPlaces = (deck, subdeckId = null) => {
	const places = [{ key: deck.id, name: deck.name, blocks: deck.intro ?? null, subdeckId: null }];
	if (!deck.usesSubdecks || !subdeckId) return places;
	const byId = new Map(deck.subdecks.map(subdeck => [subdeck.id, subdeck]));
	const trail = [];
	for (let subdeck = byId.get(subdeckId); subdeck; subdeck = byId.get(subdeck.parent_id)) trail.unshift(subdeck);
	for (const subdeck of trail) {
		places.push({ key: subdeck.id, name: subdeck.name, blocks: subdeck.intro ?? null, subdeckId: subdeck.id });
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

export { CONTENTS_FROM, introHeadings, introPlaces, isBegun, pendingIntro }
