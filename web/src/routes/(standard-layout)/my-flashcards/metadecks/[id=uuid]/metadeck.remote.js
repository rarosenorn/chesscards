import { getRequestEvent, command } from "$app/server"
import { error } from "@sveltejs/kit"
import * as metadecks from "$lib/server/metadecks.js"
import { checkIds, checkIdList } from "$lib/server/ids.js"

// what the metadeck holds, said whole (see metadecks.setItems)
export const setItems =
	command("unchecked", async ({ id, deckIds, instanceIds, metadeckIds }) => {
		const { locals } = getRequestEvent();
		checkIds(id);
		for (const ids of [deckIds, instanceIds, metadeckIds]) checkIdList(ids);
		try {
			await metadecks.setItems(locals.userId, id, { deckIds, instanceIds, metadeckIds });
		} catch (err) {
			if (err.message === "Unauthorized") error(403, "Unauthorized");
			if (err.message === "A metadeck cannot go inside itself") error(400, err.message);
			throw err;
		}
	})
