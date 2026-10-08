import { getRequestEvent, command } from "$app/server"
import { error } from "@sveltejs/kit"
import * as metadecks from "$lib/server/metadecks.js"

const UUID = /^[0-9a-f-]{36}$/i;

// what the metadeck holds, said whole (see metadecks.setItems)
export const setItems =
	command("unchecked", async ({ id, deckIds, instanceIds, metadeckIds }) => {
		const { locals } = getRequestEvent();
		const lists = [deckIds, instanceIds, metadeckIds];
		if (!lists.every(Array.isArray) || ![id, ...lists.flat()].every(value => typeof value === "string" && UUID.test(value))) {
			error(400, "Bad request");
		}
		try {
			await metadecks.setItems(locals.userId, id, { deckIds, instanceIds, metadeckIds });
		} catch (err) {
			if (err.message === "Unauthorized") error(403, "Unauthorized");
			if (err.message === "A metadeck cannot go inside itself") error(400, err.message);
			throw err;
		}
	})
