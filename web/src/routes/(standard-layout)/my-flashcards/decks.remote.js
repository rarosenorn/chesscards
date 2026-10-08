import { getRequestEvent, command } from "$app/server"
import { error } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"
import * as metadecks from "$lib/server/metadecks.js"
import { checkIdList } from "$lib/server/ids.js"

// one of the two lists, in its new order
export const reorderDecks =
	command("unchecked", async ({ marketplace: isMarketplace, ids }) => {
		const { locals } = getRequestEvent();
		checkIdList(ids);
		const reorder = isMarketplace ? marketplace.reorderInstances : decks.reorder;
		if (!await reorder(locals.userId, ids)) error(409, "The deck list changed; reload to reorder it");
	})

export const reorderMetadecks =
	command("unchecked", async ({ ids }) => {
		const { locals } = getRequestEvent();
		checkIdList(ids);
		if (!await metadecks.reorder(locals.userId, ids)) error(409, "The metadeck list changed; reload to reorder it");
	})
