import { describe, it, expect, beforeEach, vi } from "vitest"
import { mount, unmount, tick } from "svelte"
import { reactiveProps } from "./move-ref-click.svelte.js"

// The intro page is mounted outside the app: the address it reads and the
// server it saves to are stand-ins
const { page, saveIntro } = vi.hoisted(() => ({
	page: { url: new URL("http://localhost/my-flashcards/deck/intro"), params: { id: "deck" } },
	// the server's answer: what was stored, null for a page with nothing on it
	saveIntro: vi.fn(async ({ intro }) => intro.length > 0 ? intro : null)
}));
vi.mock("$app/state", () => ({ page }));
vi.mock("$lib/deck.remote.js", () => ({ saveIntro }));

const { default: IntroPage } = await import("../../routes/(standard-layout)/my-flashcards/[id=uuid]/intro/+page.svelte");

// The intro page of a deck and of a subdeck: read by anyone who has the deck,
// written by its owner.

const paragraph = words => ({ type: "paragraph", content: [{ type: "text", text: words }] });
const heading = (level, words) => ({ type: "heading", attrs: { level }, content: [{ type: "text", text: words }] });
const text = (...nodes) => [{ type: "text", content: { type: "doc", content: nodes } }];
const deckOf = (overrides = {}) => ({
	id: "deck", name: "The deck", usesSubdecks: true, isMarketplace: false,
	intro: text(heading(1, "Why"), paragraph("The deck's page"), heading(2, "How"), paragraph("More")),
	subdecks: [
		{ id: "a", name: "First", position: 1, parent_id: null, intro: text(paragraph("First's page")) },
		{ id: "b", name: "Second", position: 2, parent_id: null, intro: null }
	],
	cards: [],
	...overrides
});

describe("the intro page", () => {
	beforeEach(() => {
		globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
		saveIntro.mockClear();
	});

	const open = async (deck, subdeck = null) => {
		page.url = new URL(`http://localhost/my-flashcards/deck/intro${subdeck ? `?subdeck=${subdeck}` : ""}`);
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

	it("shows a subdeck's page under the deck's name, which leads to the deck's", async () => {
		const view = await open(deckOf(), "a");
		expect(view.title()).toBe("First");
		expect(view.body()).toContain("First's page");
		expect(view.links()).toContainEqual(["The deck", "/my-flashcards/deck/intro"]);
		expect(view.links()).toContainEqual(["Study", "/my-flashcards/deck/study?subdeck=a"]);
		view.close();
	})

	it("is read only on a deck taken from the marketplace", async () => {
		const view = await open(deckOf({ isMarketplace: true }), "b");
		expect(view.title()).toBe("Second");
		expect(view.body()).toBe("");
		expect(view.target.textContent).toContain("No intro");
		expect(view.button("Edit")).toBeFalsy();
		expect(view.button("Save")).toBeFalsy();
		// a name above leads to a page only where there is one to read
		expect(view.links()).toContainEqual(["The deck", "/my-flashcards/deck/intro"]);
		view.close();
	})

	it("falls back to the deck's page for a subdeck the deck does not have, or does not show", async () => {
		let view = await open(deckOf(), "nope");
		expect(view.title()).toBe("The deck");
		view.close();
		view = await open(deckOf({ usesSubdecks: false }), "a");
		expect(view.title()).toBe("The deck");
		view.close();
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
		expect(sent.subdeckId).toBe(null);
		// unchanged in the editor, so unchanged on the way out
		expect(sent.intro).toEqual(before);
		expect(view.title()).toBe("The deck");
		expect(view.button("Edit")).toBeTruthy();
		view.close();
	})

	it("opens a page with nothing on it for writing, and an empty one saved is no intro", async () => {
		const view = await open(deckOf(), "b");
		expect(await view.editor()).toBeTruthy();
		expect(view.button("Cancel")).toBeFalsy();
		await view.press("Save");
		await tick();
		expect(saveIntro).toHaveBeenCalledWith({ deckId: "deck", subdeckId: "b", intro: [] });
		expect(view.deck.subdecks[1].intro).toBe(null);
		expect(view.target.textContent).toContain("No intro");
		view.close();
	})

	it("leaves the page as it was on Cancel", async () => {
		const view = await open(deckOf(), "a");
		await view.press("Edit");
		expect(await view.editor()).toBeTruthy();
		await view.press("Cancel");
		expect(saveIntro).not.toHaveBeenCalled();
		expect(view.body()).toContain("First's page");
		view.close();
	})
})
