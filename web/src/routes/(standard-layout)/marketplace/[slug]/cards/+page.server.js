import * as marketplace from "$lib/server/marketplace.js"

export const load = async ({ parent }) => {
	// see the overview's load: the layout decides who may see the deck
	const { mpDeck } = await parent();
	return {
		previewCards: await marketplace.getDeckPreviewCards(mpDeck.id)
	}
}
