import { describe, it, expect, vi } from "vitest"
import { mount, unmount, tick, createRawSnippet } from "svelte"

// The deck pages' layout mounted outside the app, on whichever tab the
// address names: what the arrow beside the deck's name, and the names before
// it, lead to.
const state = vi.hoisted(() => ({ page: { url: new URL("http://localhost/"), params: {} } }));
vi.mock("$app/state", () => ({ get page() { return state.page } }));
vi.mock("$app/navigation", () => ({ beforeNavigate: () => {}, goto: () => {}, preloadCode: () => {} }));
vi.mock("$lib/modals.svelte.js", () => ({ confirmModal: async () => false, modalState: { current: null } }));

const { default: Layout } = await import("../../routes/(standard-layout)/my-flashcards/[id=uuid]/+layout@.svelte");

// "inner" sits inside "top"; inside it are one deck of the user's own and a
// marketplace deck taken (no Add cards there)
const deck = {
	id: "inner", name: "Inner", isMarketplace: false,
	ancestors: [{ id: "top", name: "Top", bought: false }],
	decks: [
		{ id: "inner", name: "Inner", position: 1, parent_id: null, in_order: true, bought: false },
		{ id: "own", name: "Own", position: 1, parent_id: "inner", in_order: true, bought: false },
		{ id: "taken", name: "Taken", position: 2, parent_id: "inner", in_order: true, bought: true }
	],
	cards: []
};

// the layout warms the card editor once the page is idle: not wanted here;
// and jsdom has no ResizeObserver for the names that shorten when cut
window.requestIdleCallback = () => {};
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

const open = async path => {
	state.page = { url: new URL(`http://localhost/my-flashcards/inner/${path}`), params: { id: "inner" } };
	const target = document.createElement("div");
	document.body.append(target);
	const app = mount(Layout, {
		target,
		props: { data: { deck: structuredClone(deck) }, children: createRawSnippet(() => ({ render: () => "<p></p>" })) }
	});
	await tick();
	target.querySelector(".switcher-toggle")?.click();
	await tick();
	const view = {
		options: () => Object.fromEntries([...target.querySelectorAll(".switcher-menu a")].map(a => [a.textContent.trim(), a.getAttribute("href")])),
		crumb: name => [...target.querySelectorAll(".breadcrumbs a.crumb")].find(a => a.textContent.trim() === name)?.getAttribute("href"),
		label: () => target.querySelector(".switcher-toggle")?.getAttribute("aria-label") ?? null,
		close: () => { unmount(app); target.remove(); }
	};
	return view;
}

describe("the arrow beside the deck's name", () => {
	it("is there on every tab, and leads to the same tab of the deck chosen", async () => {
		for (const tab of ["study", "browse", "add-cards", "deck", "settings"]) {
			const view = await open(tab);
			expect(view.label()).toBe(tab === "study" ? "Choose what to study" : "Choose a deck");
			expect(view.options().Top).toBe(`/my-flashcards/top/${tab}`);
			expect(view.options().Own).toBe(`/my-flashcards/own/${tab}`);
			// so do the names before the deck's
			expect(view.crumb("Top")).toBe(`/my-flashcards/top/${tab}`);
			view.close();
		}
	})

	it("leads to a marketplace deck's Study where it has no such tab", async () => {
		let view = await open("add-cards");
		expect(view.options().Taken).toBe("/my-flashcards/taken/study");
		view.close();
		view = await open("browse");
		expect(view.options().Taken).toBe("/my-flashcards/taken/browse");
		view.close();
	})

	it("leads from a page off a tab to that tab of the deck chosen", async () => {
		const view = await open("add-cards/from-game");
		expect(view.options().Own).toBe("/my-flashcards/own/add-cards");
		view.close();
	})
})
