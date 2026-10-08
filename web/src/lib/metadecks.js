// A metadeck is its owner's grouping of decks, and of other metadecks, for
// studying them together. Here a metadeck is { id, items }, its items the
// things it holds, each { kind: "metadeck" | "instance" | "deck", id } (an
// instance is a marketplace deck the user has taken), in the order they
// stand in My flashcards.

// The decks a metadeck comes to: everything under it, through the metadecks
// inside it, each deck once however many ways lead to it, in the order met.
const resolveDecks = (metadecks, metadeckId) => {
	const byId = new Map(metadecks.map(metadeck => [metadeck.id, metadeck]));
	const walked = new Set();
	const found = new Map();
	const walk = id => {
		if (walked.has(id)) return;
		walked.add(id);
		for (const item of byId.get(id)?.items ?? []) {
			if (item.kind === "metadeck") walk(item.id);
			else if (!found.has(item.id)) found.set(item.id, item);
		}
	}
	walk(metadeckId);
	return [...found.values()];
}

// The metadecks that cannot go inside one without closing a loop: itself, and
// every metadeck that holds it, directly or through others.
const holders = (metadecks, metadeckId) => {
	const held = new Set([metadeckId]);
	for (let grew = true; grew;) {
		grew = false;
		for (const metadeck of metadecks) {
			if (!held.has(metadeck.id) && metadeck.items.some(item => item.kind === "metadeck" && held.has(item.id))) {
				held.add(metadeck.id);
				grew = true;
			}
		}
	}
	return held;
}

export { resolveDecks, holders }
