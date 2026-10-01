import { getRequestEvent, command } from "$app/server"
import { error } from "@sveltejs/kit"
import { pool } from "$lib/server/pool.js"
import * as decks from "$lib/server/decks.js"
import * as gameImport from "$lib/server/game-import.js"

// the game goes into the line; the page asks after it with importStatus
export const startImport =
	command("unchecked", async ({ deckId, stageId, pgn, color, kinds }) => {
		const { locals } = getRequestEvent();
		try {
			return { jobId: await gameImport.start(locals.userId, { deckId, stageId, pgn, color, kinds }) };
		} catch (err) {
			error(400, err.message);
		}
	})

// A finished import comes with the fresh deck, for the client to assign into
// the shared context: the new cards are then in Cards and Study at once.
export const importStatus =
	command("unchecked", async ({ jobId, deckId }) => {
		const { locals } = getRequestEvent();
		const status = gameImport.status(locals.userId, jobId);
		if (!status) error(404, "The import is gone: the server restarted, or it finished a while ago");
		if (status.phase !== "done") return status;
		return { ...status, deck: await decks.getById(locals.userId, deckId) };
	})

// remembered once a name has turned up games, so the page opens on them
export const saveChesscomUsername =
	command("unchecked", async ({ username }) => {
		const { locals } = getRequestEvent();
		if (typeof username !== "string" || !/^[A-Za-z0-9_-]{1,50}$/.test(username)) error(400, "Not a Chess.com username");
		await pool.query('update "user" set "chesscomUsername" = $1 where id = $2', [username, locals.userId]);
	})
