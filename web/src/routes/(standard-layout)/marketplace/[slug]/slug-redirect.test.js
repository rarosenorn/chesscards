import { describe, it, expect, vi, beforeEach } from "vitest"

const marketplace = vi.hoisted(() => ({ findDeckBySlug: vi.fn(), getOwnership: vi.fn(), getRenameRequest: vi.fn(), FOR_SALE: "true", REVIEW_COUNTS: "0" }));
vi.mock("$lib/server/marketplace.js", () => marketplace);
const pool = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("$lib/server/pool.js", () => ({ pool }));

const { load } = await import("./+layout.server.js");

let visitor = {};

const visit = async path => {
	const url = new URL(`http://localhost${path}`);
	try {
		return { data: await load({ params: { slug: decodeURIComponent(url.pathname.split("/")[2]) }, locals: visitor, url }) };
	} catch (thrown) {
		return { status: thrown.status, location: thrown.location };
	}
};

describe("a marketplace deck's URL", () => {
	beforeEach(() => {
		visitor = {};
		marketplace.findDeckBySlug.mockReset();
		marketplace.getOwnership.mockResolvedValue({ owned: false, inLibrary: false });
		pool.query.mockReset();
		pool.query.mockResolvedValue({ rows: [{ id: "d", slug: "new-name", name: "New name", forSale: true, isAuthor: false }] });
	});

	it("its name now: the deck", async () => {
		marketplace.findDeckBySlug.mockResolvedValue({ id: "d", slug: "new-name", current: true });
		const { data } = await visit("/marketplace/new-name/overview");
		expect([data.mpDeck.id, pool.query.mock.calls[0][1][0]]).toEqual(["d", "d"]);
	});

	it("a name from before a rename: a temporary redirect to the same page under the name now", async () => {
		marketplace.findDeckBySlug.mockResolvedValue({ id: "d", slug: "new-name", current: false });
		expect(await visit("/marketplace/old-name/cards?view=1")).toEqual({ status: 302, location: "/marketplace/new-name/cards?view=1" });
		expect(marketplace.findDeckBySlug).toHaveBeenCalledWith("old-name");
	});

	it("a name in another script redirects encoded", async () => {
		marketplace.findDeckBySlug.mockResolvedValue({ id: "d", slug: "国际象棋", current: false });
		expect((await visit("/marketplace/old/overview")).location).toBe(`/marketplace/${encodeURIComponent("国际象棋")}/overview`);
	});

	it("the deck's own page, without a sub-page, redirects without a trailing slash", async () => {
		marketplace.findDeckBySlug.mockResolvedValue({ id: "d", slug: "new-name", current: false });
		expect((await visit("/marketplace/old-name")).location).toBe("/marketplace/new-name");
	});

	it("an old name of a deck off sale tells someone without it nothing, not even its name now", async () => {
		marketplace.findDeckBySlug.mockResolvedValue({ id: "d", slug: "new-name", current: false });
		pool.query.mockResolvedValue({ rows: [{ id: "d", slug: "new-name", name: "New name", forSale: false, isAuthor: false }] });
		expect(await visit("/marketplace/old-name/overview")).toEqual({ status: 404, location: undefined });
		marketplace.getOwnership.mockResolvedValue({ owned: true, inLibrary: true });
		visitor = { userId: "u" };
		expect((await visit("/marketplace/old-name/overview")).location).toBe("/marketplace/new-name/overview");
	});

	it("no deck by that name: 404", async () => {
		marketplace.findDeckBySlug.mockResolvedValue(undefined);
		expect((await visit("/marketplace/nothing/overview")).status).toBe(404);
	});
});
