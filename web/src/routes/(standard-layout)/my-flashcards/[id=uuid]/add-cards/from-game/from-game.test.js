import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mount, unmount, tick } from "svelte"

const remote = vi.hoisted(() => ({
	startImport: vi.fn(async () => ({ jobId: "job" })),
	importStatus: vi.fn(async () => ({ phase: "queued", done: 0, total: 0 })),
	cancelImport: vi.fn(async () => ({ cancelled: true })),
	saveUsername: vi.fn(async () => {})
}));
vi.mock("./import.remote.js", () => remote);
vi.mock("$app/state", () => ({ page: { data: { pageTitle: "Import from game" } } }));

const { default: Page } = await import("./+page.svelte");

const lichessGame = (n, createdAt) => ({
	id: `g${n}`, variant: "standard", speed: "blitz", pgn: "1. e4 e5", createdAt, lastMoveAt: createdAt,
	clock: { initial: 180, increment: 2 }, winner: "white",
	players: { white: { user: { id: "me", name: "me" }, rating: 1500 }, black: { user: { id: "you", name: "you" }, rating: 1500 } }
});
const ndjson = games => games.map(game => JSON.stringify(game)).join("\n");

// a fetch that answers only when told to, so overlapping requests can be seen
const gatedFetch = () => {
	const calls = [];
	const fetch = vi.fn(url => new Promise(resolve => calls.push({ url: String(url), answer: body => resolve(new Response(body, { status: 200 })) })));
	return { fetch, calls };
}

const settle = async () => { for (let i = 0; i < 5; i++) { await tick(); await new Promise(resolve => setTimeout(resolve)); } };

describe("Import from game", () => {
	let target, app;
	const open = () => {
		target = document.createElement("div");
		document.body.append(target);
		const deck = { id: "11111111-1111-1111-1111-111111111111", decks: [{ id: "11111111-1111-1111-1111-111111111111", name: "Deck", parent_id: null, position: 1 }], cards: [] };
		app = mount(Page, {
			target,
			props: { data: { usernames: { chesscom: "", lichess: "me" }, activeImport: null } },
			context: new Map([["deck", deck]])
		});
	}
	const lichessForm = () => target.querySelector('input[aria-label="Lichess username"]').closest("form");
	const button = label => [...target.querySelectorAll("button")].find(el => el.textContent.trim() === label);

	beforeEach(() => open());
	afterEach(() => { unmount(app); target.remove(); vi.unstubAllGlobals(); });

	it("asks Lichess one download at a time when Fetch is pressed twice", async () => {
		const { fetch, calls } = gatedFetch();
		vi.stubGlobal("fetch", fetch);
		lichessForm().requestSubmit();
		await tick();
		lichessForm().requestSubmit();
		await settle();
		expect(calls.length).toBe(1);
		calls[0].answer(ndjson([lichessGame(1, 1000)]));
		await settle();
		expect(calls.length).toBe(2);
		calls[1].answer(ndjson([lichessGame(1, 1000)]));
		await settle();
		expect(target.querySelectorAll("ul.games li").length).toBe(1);
	})

	it("loads the next page once however often Load more is pressed while it loads", async () => {
		const { fetch, calls } = gatedFetch();
		vi.stubGlobal("fetch", fetch);
		lichessForm().requestSubmit();
		await settle();
		calls[0].answer(ndjson(Array.from({ length: 30 }, (_, i) => lichessGame(i, 100_000 - i))));
		await settle();
		button("Load more").click();
		await settle();
		button("Loading").click();
		button("Loading").click();
		await settle();
		expect(calls.length).toBe(2);
		calls[1].answer(ndjson([lichessGame(30, 50_000)]));
		await settle();
		expect(calls.length).toBe(2);
		expect(target.querySelectorAll("ul.games li").length).toBe(31);
	})
})
