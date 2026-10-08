import { getRequestEvent, command } from "$app/server"
import { error } from "@sveltejs/kit"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"
import * as metadecks from "$lib/server/metadecks.js"
import { checkIds, checkIdList } from "$lib/server/ids.js"

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

// a deck, a marketplace deck or a metadeck (kind says which) goes into a
// metadeck, leaving the one it was dragged out of when that is named
export const addToMetadeck =
	command("unchecked", async ({ metadeckId, kind, id, fromMetadeckId }) => {
		const { locals } = getRequestEvent();
		if (!Object.hasOwn(metadecks.KINDS, kind)) error(400, "Bad request");
		checkIds(metadeckId, id, fromMetadeckId ?? []);
		try {
			await metadecks.addItem(locals.userId, metadeckId, kind, id, fromMetadeckId ?? null);
		} catch (err) {
			if (err.message === "Unauthorized") error(403, "Unauthorized");
			if (err.message === "A metadeck cannot go inside itself") error(400, err.message);
			throw err;
		}
	})

export const removeFromMetadeck =
	command("unchecked", async ({ metadeckId, kind, id }) => {
		const { locals } = getRequestEvent();
		if (!Object.hasOwn(metadecks.KINDS, kind)) error(400, "Bad request");
		checkIds(metadeckId, id);
		if (!await metadecks.removeItem(locals.userId, metadeckId, kind, id)) error(403, "Unauthorized");
	})
