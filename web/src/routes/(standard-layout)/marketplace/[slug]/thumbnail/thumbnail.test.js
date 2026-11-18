import { describe, it, expect, vi, beforeEach } from "vitest"

const marketplace = vi.hoisted(() => ({ findDeckBySlug: vi.fn(), getDeckImage: vi.fn(), getOwnership: vi.fn() }));
vi.mock("$lib/server/marketplace.js", () => marketplace);

const { GET } = await import("./+server.js");

const fetchThumbnail = async (locals = {}) => {
	try {
		const response = await GET({ params: { slug: "deck" }, locals });
		return { status: response.status, cache: response.headers.get("Cache-Control") };
	} catch (thrown) {
		return { status: thrown.status };
	}
};

describe("a marketplace deck's thumbnail", () => {
	beforeEach(() => {
		marketplace.findDeckBySlug.mockResolvedValue({ id: "d", slug: "deck", current: true });
		marketplace.getOwnership.mockResolvedValue({ owned: false, inLibrary: false });
	});

	it("on sale: anyone, cached publicly", async () => {
		marketplace.getDeckImage.mockResolvedValue({ image: new Uint8Array([1]), imageType: "image/png", forSale: true });
		expect(await fetchThumbnail()).toEqual({ status: 200, cache: "public, max-age=3600" });
	});

	it("off sale or taken down: only those who may see the deck, cached privately", async () => {
		marketplace.getDeckImage.mockResolvedValue({ image: new Uint8Array([1]), imageType: "image/png", forSale: false });
		expect(await fetchThumbnail()).toEqual({ status: 404 });
		expect(await fetchThumbnail({ userId: "u" })).toEqual({ status: 404 });
		marketplace.getOwnership.mockResolvedValue({ owned: true, inLibrary: true });
		expect(await fetchThumbnail({ userId: "u" })).toEqual({ status: 200, cache: "private, max-age=3600" });
		marketplace.getOwnership.mockResolvedValue({ owned: false, inLibrary: false });
		expect(await fetchThumbnail({ userId: "a", isAdmin: true })).toEqual({ status: 200, cache: "private, max-age=3600" });
	});

	it("no deck by that name: 404", async () => {
		marketplace.findDeckBySlug.mockResolvedValue(undefined);
		expect(await fetchThumbnail()).toEqual({ status: 404 });
	});
});
