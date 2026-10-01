import { error } from "@sveltejs/kit"

// marketplace deck instances are readonly: nothing is imported into them
export const load = async ({ locals, parent }) => {
	const { deck } = await parent();
	if (deck.isMarketplace) error(404);
	return {
		pageTitle: "Import from game",
		chesscomUsername: locals.user?.chesscomUsername ?? ""
	}
}
