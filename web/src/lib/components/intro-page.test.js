import { describe, it, expect, beforeEach, vi } from "vitest"
import { mount, unmount, tick } from "svelte"
import { reactiveProps } from "./move-ref-click.svelte.js"

// The intro page is mounted outside the app: the server it saves to is a
// stand-in
const { saveIntro } = vi.hoisted(() => ({
	// the server's answer: what was stored, null for a page with nothing on it
	saveIntro: vi.fn(async ({ intro }) => intro.length > 0 ? intro : null)
}));
vi.mock("$lib/deck.remote.js", () => ({ saveIntro }));

const { default: IntroPage } = await import("../../routes/(standard-layout)/my-flashcards/[id=uuid]/intro/+page.svelte");

// The intro page of a deck, and of a deck inside another: read by anyone who
// has the deck, written by its owner.

const paragraph = words => ({ type: "paragraph", content: [{ type: "text", text: words }] });
const heading = (level, words) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text: words }] });
const text = (...nodes) => [{ type: "text", content: { type: "doc", content: nodes } }];
const deckPage = text(heading(1, "Why"), paragraph("The deck's page"), heading(2, "How"), paragraph("More"));
// a deck as the layout loads it: itself first among its decks, the decks it
// sits inside as ancestors
const deckOf = ({ id = "deck", name = "The deck", intro = deckPage, ancestors = [], isMarketplace = false } = {}) => ({
	id, name, intro, ancestors, isMarketplace,
	decks: [{ id, name, position: 1, parent_id: null, in_order: true, intro }],
	cards: []
});
const inside = (overrides = {}) => deckOf({
	id: "a", name: "First", intro: text(paragraph("First's page")),
	ancestors: [{ id: "deck", name: "The deck", intro: deckPage, begun: false }],
	...overrides
});

describe("the intro page", () => {
	beforeEach(() => {
		globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
		saveIntro.mockClear();
	});

	const open = async deck => {
		const target = document.createElement("div");
		document.body.append(target);
		const shared = reactiveProps(deck);
		const app = mount(IntroPage, { target, context: new Map([["deck", shared]]) });
		await tick();
		const button = label => [...target.querySelectorAll("button")].find(el => el.textContent.trim() === label);
		return {
			target, button, deck: shared,
			title: () => target.querySelector(".intro h1")?.textContent ?? null,
			body: () => target.querySelector(".intro .body")?.textContent.replace(/\s+/g, " ").trim() ?? null,
			links: () => [...target.querySelectorAll("a")].map(a => [a.textContent.trim(), a.getAttribute("href")]),
			press: async label => { button(label).click(); await tick(); },
			// the editor is a chunk of its own, loaded when first asked for
			editor: async () => {
				for (let i = 0; i < 100 && !target.querySelector(".description-editor .ProseMirror"); i++) await new Promise(resolve => setTimeout(resolve, 20));
				await tick();
				return target.querySelector(".description-editor .ProseMirror");
			},
			close: () => { unmount(app); target.remove(); }
		};
	}

	it("shows the deck's page with the way on to study", async () => {
		const view = await open(deckOf());
		expect(view.title()).toBe("The deck");
		expect(view.body()).toContain("The deck's page");
		expect(view.links()).toContainEqual(["Study", "/my-flashcards/deck/study"]);
		expect(view.button("Edit")).toBeTruthy();
		view.close();
	})

	it("shows a deck inside another under that one's name, which leads to its page", async () => {
		const view = await open(inside());
		expect(view.title()).toBe("First");
		expect(view.body()).toContain("First's page");
		expect(view.links()).toContainEqual(["The deck", "/my-flashcards/deck/intro"]);
		expect(view.links()).toContainEqual(["Study", "/my-flashcards/a/study"]);
		view.close();
	})

	it("is read only on a deck taken from the marketplace", async () => {
		const view = await open(inside({ id: "b", name: "Second", intro: null, isMarketplace: true }));
		expect(view.title()).toBe("Second");
		expect(view.body()).toBe("");
		expect(view.target.textContent).toContain("No intro");
		expect(view.button("Edit")).toBeFalsy();
		expect(view.button("Save")).toBeFalsy();
		// a name above leads to a page only where there is one to read
		expect(view.links()).toContainEqual(["The deck", "/my-flashcards/deck/intro"]);
		view.close();
		const bare = await open(inside({ id: "b", name: "Second", intro: null, isMarketplace: true,
			ancestors: [{ id: "deck", name: "The deck", intro: null, begun: false }] }));
		expect(bare.links().map(([name]) => name)).not.toContain("The deck");
		bare.close();
	})

	it("saves what was written, headings and all, into the shared deck", async () => {
		const view = await open(deckOf());
		await view.press("Edit");
		const editor = await view.editor();
		expect(editor).toBeTruthy();
		// the editor knows headings: they are still headings in it
		expect([...editor.querySelectorAll("h2, h3")].map(el => `${el.tagName} ${el.textContent}`)).toEqual(["H2 Why", "H3 How"]);

		const before = JSON.parse(JSON.stringify(view.deck.intro));
		await view.press("Save");
		await tick();
		expect(saveIntro).toHaveBeenCalledTimes(1);
		const sent = saveIntro.mock.calls[0][0];
		expect(sent.deckId).toBe("deck");
		// unchanged in the editor, so unchanged on the way out
		expect(sent.intro).toEqual(before);
		expect(view.title()).toBe("The deck");
		expect(view.button("Edit")).toBeTruthy();
		view.close();
	})

	it("opens a page with nothing on it for writing, and an empty one saved is no intro", async () => {
		const view = await open(inside({ id: "b", name: "Second", intro: null }));
		expect(await view.editor()).toBeTruthy();
		expect(view.button("Cancel")).toBeFalsy();
		await view.press("Save");
		await tick();
		expect(saveIntro).toHaveBeenCalledWith({ deckId: "b", intro: [] });
		expect(view.deck.decks[0].intro).toBe(null);
		expect(view.target.textContent).toContain("No intro");
		view.close();
	})

	it("leaves the page as it was on Cancel", async () => {
		const view = await open(inside());
		await view.press("Edit");
		expect(await view.editor()).toBeTruthy();
		await view.press("Cancel");
		expect(saveIntro).not.toHaveBeenCalled();
		expect(view.body()).toContain("First's page");
		view.close();
	})
})
