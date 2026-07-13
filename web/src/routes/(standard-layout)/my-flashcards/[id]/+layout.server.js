import * as decks from "$lib/server/decks.js"

const load = async ({ locals, params }) => {
	return {
		deck: await decks.getById(locals.userId, params.id)
	}
};

export { load }
