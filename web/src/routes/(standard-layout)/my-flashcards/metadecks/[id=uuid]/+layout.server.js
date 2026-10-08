import { error } from "@sveltejs/kit"
import * as metadecks from "$lib/server/metadecks.js"

// A metadeck is studied as a deck is, so it comes in a deck's shape and under
// a deck's name (see metadecks.getForStudy).
const load = async ({ locals, params }) => {
	const deck = await metadecks.getForStudy(locals.userId, params.id);
	if (!deck) error(404);

	return { deck };
};

export { load }
