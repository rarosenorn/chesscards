import { describe, it, expect, vi, beforeAll, afterEach } from "vitest"
import { mount, unmount, tick } from "svelte"

const page = vi.hoisted(() => ({ params: { id: "m1" }, url: new URL("http://localhost/author/m1/changes") }));
vi.mock("$app/state", () => ({ page }));
const goto = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$app/forms", () => ({ deserialize: JSON.parse }));

const { default: ChangesPage } = await import("./[id=uuid]/changes/+page@.svelte");

const text = words => [{ type: "text", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } }];
const card = id => ({ id, front: text(`card ${id}`), back: [], card_type: "basic" });
const deck = { id: "m1", slug: "alpha", name: "Alpha", description: text("Live"), previewCardIds: ["c1"] };

let sent = null;

const open = async pending => {
	const target = document.createElement("div");
	document.body.append(target);
	const app = mount(ChangesPage, { target, props: { data: { deck, cards: [card("c1"), card("c2")], pending } } });
	await tick();
	const button = label => [...target.querySelectorAll("button")].find(b => b.textContent.trim().startsWith(label));
	return {
		target,
		name: () => target.querySelector("#mp-name").value,
		thumbnail: () => target.querySelector("img.thumbnail")?.getAttribute("src"),
		button,
		send: async () => {
			target.querySelector("#change-details").requestSubmit();
			await tick();
			button("Send for review").click();
			await vi.waitFor(() => expect(sent).not.toBe(null));
		},
		close: () => { unmount(app); target.remove(); }
	};
};

describe("Request changes", () => {
	beforeAll(() => {
		globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
		Element.prototype.scrollIntoView ??= () => {};
		globalThis.fetch = vi.fn(async (url, { body }) => {
			sent = { url, fields: Object.fromEntries(body.entries()) };
			return new Response(JSON.stringify({ type: "success", status: 200 }));
		});
	});
	afterEach(() => { sent = null; goto.mockClear(); });

	it("starts as the deck's page shows it, and sends that back with no image", async () => {
		const view = await open(null);
		expect([view.name(), view.thumbnail(), view.button("Keep the current one")]).toEqual(["Alpha", "/marketplace/alpha/thumbnail", undefined]);
		await view.send();
		expect(sent.url).toBe("?/requestChanges");
		expect([sent.fields.name, sent.fields.previewCardIds, sent.fields.image, sent.fields.keepPendingImage]).toEqual(["Alpha", '["c1"]', undefined, undefined]);
		expect(JSON.parse(sent.fields.description)[0].content.content[0].content[0].text).toBe("Live");
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith("/author", { invalidateAll: true }));
		view.close();
	});

	it("with changes waiting: starts from them, keeping their thumbnail unless told otherwise", async () => {
		const pending = { status: "pending", name: "Alpha Two", description: null, hasImage: true, previewCardIds: ["c2"], createdAt: "2026-11-18T10:00:00Z" };
		const view = await open(pending);
		expect(view.name()).toBe("Alpha Two");
		expect(view.thumbnail()).toBe(`/author/m1/changes/thumbnail?v=${Date.parse(pending.createdAt)}`);
		expect(view.target.textContent).toContain("Asking again replaces the changes waiting for review.");
		await view.send();
		expect([sent.fields.name, sent.fields.previewCardIds, sent.fields.keepPendingImage]).toEqual(["Alpha Two", '["c2"]', "true"]);
		view.close();
	});

	it("Keep the current one goes back to the deck's own thumbnail", async () => {
		const view = await open({ status: "pending", name: null, description: null, hasImage: true, previewCardIds: null, createdAt: "2026-11-18T10:00:00Z" });
		view.button("Keep the current one").click();
		await tick();
		expect([view.thumbnail(), view.button("Keep the current one")]).toEqual(["/marketplace/alpha/thumbnail", undefined]);
		await view.send();
		expect([sent.fields.name, sent.fields.keepPendingImage]).toEqual(["Alpha", undefined]);
		view.close();
	});
});
