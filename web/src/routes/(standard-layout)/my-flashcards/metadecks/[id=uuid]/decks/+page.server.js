import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"
import * as metadecks from "$lib/server/metadecks.js"

// everything of the user's that could go in a metadeck, as My flashcards
// lists it
export const load = async ({ locals }) => ({
	pageTitle: "Decks",
	metadecks: await metadecks.getMine(locals.userId),
	marketplaceDecks: await marketplace.getInstanceNames(locals.userId),
	decks: await decks.getNames(locals.userId)
})
