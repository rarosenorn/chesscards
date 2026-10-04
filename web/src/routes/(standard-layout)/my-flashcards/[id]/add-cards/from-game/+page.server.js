import { error } from "@sveltejs/kit"
import * as gameImport from "$lib/server/game-import.js"

// marketplace deck instances are readonly: nothing is imported into them
export const load = async ({ locals, parent }) => {
	const { deck } = await parent();
	if (deck.isMarketplace) error(404);
	return {
		pageTitle: "Import from game",
		// an import of the user's still under way, for the page to pick up
		activeImport: gameImport.active(locals.userId),
		usernames: {
			chesscom: locals.user?.chesscomUsername ?? "",
			lichess: locals.user?.lichessUsername ?? ""
		}
	}
}
