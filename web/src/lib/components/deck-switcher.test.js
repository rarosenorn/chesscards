import { describe, it, expect, vi } from "vitest"
import { mount, unmount, tick, createRawSnippet } from "svelte"

// The deck pages' layout mounted outside the app, on whichever tab the
// address names: what the arrow beside the deck's name, and the names before
// it, lead to.
const state = vi.hoisted(() => ({ page: { url: new URL("http://localhost/"), params: {} }, leave: null }));
vi.mock("$app/state", () => ({ get page() { return state.page } }));
// the layout's beforeNavigate is kept, to be called as a navigation would
vi.mock("$app/navigation", () => ({ beforeNavigate: fn => { state.leave = fn }, goto: vi.fn(), preloadCode: () => {} }));
vi.mock("$lib/modals.svelte.js", () => ({ confirmModal: vi.fn(async () => true), modalState: { current: null } }));

const { default: Layout } = await import("../../routes/(standard-layout)/my-flashcards/[id=uuid]/+layout@.svelte");
const { default: Harness } = await import("./deck-layout-harness.svelte");
const { reactiveProps } = await import("./move-ref-click.svelte.js");
const { goto } = await import("$app/navigation");
const { confirmModal } = await import("$lib/modals.svelte.js");

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

	// Turned to another deck, the layout stays and its page goes on: each
	// deck's pages start afresh, with nothing kept for the deck before.
	const at = (id, path) => ({ url: new URL(`http://localhost/my-flashcards/${id}/${path}`), params: { id } });
	const openHarness = async () => {
		state.page = reactiveProps(at("inner", "browse"));
		const target = document.createElement("div");
		document.body.append(target);
		const seen = [];
		const props = reactiveProps({ data: { deck: structuredClone(deck) }, onMounted: drafts => seen.push(drafts) });
		const app = mount(Harness, { target, props });
		await tick();
		return {
			seen,
			// a navigation as SvelteKit makes it: beforeNavigate, then the page
			go: async (id, path) => {
				const nav = { to: { url: at(id, path).url }, cancel: vi.fn(), willUnload: false };
				state.leave(nav);
				await tick();
				if (nav.cancel.mock.calls.length) return nav;
				Object.assign(state.page, at(id, path));
				props.data = { deck: { ...structuredClone(deck), id, name: id } };
				await tick();
				return nav;
			},
			close: () => { unmount(app); target.remove(); }
		};
	}

	it("starts the page of the deck turned to afresh, without the last deck's drafts", async () => {
		const view = await openHarness();
		expect(view.seen).toHaveLength(1);
		view.seen[0].browse = { selectedCardId: "a card of Inner", editingCardId: null, sortColumn: "order", sortDescending: false };
		await view.go("own", "browse");
		expect(view.seen).toHaveLength(2);
		expect(view.seen[1].browse).toBe(null);
		view.close();
	})

	it("asks about unsaved changes every time a deck is left, not only the first", async () => {
		const view = await openHarness();
		const editing = () => { view.seen.at(-1).browse = { editingCardId: "x", selectedCardId: "x" } };
		editing();
		let nav = await view.go("own", "browse");
		expect(nav.cancel).toHaveBeenCalled();
		await tick();
		expect(confirmModal).toHaveBeenCalledTimes(1);
		expect(goto).toHaveBeenCalledTimes(1);
		// the confirmed navigation goes through
		nav = await view.go("own", "browse");
		expect(nav.cancel).not.toHaveBeenCalled();
		// and the next deck left with unsaved work asks again
		editing();
		nav = await view.go("inner", "browse");
		expect(nav.cancel).toHaveBeenCalled();
		view.close();
	})
})

describe("the names before the deck's", () => {
	const crumbsOf = async ancestors => {
		state.page = { url: new URL("http://localhost/my-flashcards/deep/study"), params: { id: "deep" } };
		const target = document.createElement("div");
		document.body.append(target);
		const decks = [{ id: "deep", name: "Deep", position: 1, parent_id: null, in_order: true, bought: false }];
		const app = mount(Layout, {
			target,
			props: {
				data: { deck: { id: "deep", name: "Deep", isMarketplace: false, ancestors: ancestors.map(a => ({ ...a, bought: false })), decks, cards: [] } },
				children: createRawSnippet(() => ({ render: () => "<p></p>" }))
			}
		});
		await tick();
		const text = target.querySelector(".breadcrumbs").textContent.replace(/\s+/g, "");
		const links = [...target.querySelectorAll(".breadcrumbs a.crumb")].map(a => a.textContent.trim());
		target.querySelector(".switcher-toggle").click();
		await tick();
		const options = [...target.querySelectorAll(".switcher-menu a")].map(a => a.textContent.trim());
		const maxHeight = target.querySelector(".switcher-menu").style.maxHeight;
		unmount(app);
		target.remove();
		return { text, links, options, maxHeight };
	}

	it("are the deck it sits in, with any further out folded into an ellipsis the arrow still reaches, in a menu that stops at the window's edge", async () => {
		expect((await crumbsOf([{ id: "top", name: "Top" }])).text).toBe("Myflashcards->Top›Deep");
		const deep = await crumbsOf([{ id: "top", name: "Top" }, { id: "middle", name: "Middle" }]);
		expect(deep.text).toBe("Myflashcards->…›Middle›Deep");
		expect(deep.links).toContain("Middle");
		expect(deep.links).not.toContain("Top");
		expect(deep.options).toEqual(expect.arrayContaining(["Top", "Middle", "Deep"]));
		expect(deep.maxHeight).toBe(`${window.innerHeight - 8}px`);
	})
})
