import { describe, it, expect, vi, beforeEach } from "vitest"

// The Settings page's tactic ladder field: typed days in, a ladder (or null,
// to take the deck above's) out to the server
const decks = vi.hoisted(() => ({ setTacticLadder: vi.fn(async () => true) }));
vi.mock("$lib/server/decks.js", () => decks);
vi.mock("$lib/server/marketplace.js", () => ({}));

const { actions } = await import("./+page.server.js");

const save = typed => {
	const body = new FormData();
	body.set("ladder", typed);
	return actions.tacticLadder({ params: { id: "deck" }, locals: { userId: "user" }, request: new Request("http://x", { method: "POST", body }) });
}

describe("the tactic ladder field", () => {
	beforeEach(() => decks.setTacticLadder.mockClear());

	it("takes days apart by commas or spaces", async () => {
		await save(" 3, 10 30 ");
		expect(decks.setTacticLadder).toHaveBeenCalledWith("user", "deck", [3, 10, 30]);
	});

	it("left empty, takes the deck above's", async () => {
		await save("");
		expect(decks.setTacticLadder).toHaveBeenCalledWith("user", "deck", null);
	});

	it("refuses what is not whole days, and keeps what was typed", async () => {
		for (const typed of ["7, x", "0", "2.5", "4000", Array(13).fill(1).join(",")]) {
			const result = await save(typed);
			expect(result.status).toBe(400);
			expect(result.data.ladder).toBe(typed);
		}
		expect(decks.setTacticLadder).not.toHaveBeenCalled();
	});
});
