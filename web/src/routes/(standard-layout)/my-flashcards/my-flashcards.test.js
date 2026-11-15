import { describe, it, expect, beforeEach, vi } from "vitest"
import { mount, unmount, tick, flushSync } from "svelte"

// My flashcards mounted outside the app, with the app's modal host beside it:
// the server it asks to make and move decks is a stand-in that records what
// it was asked.
const remote = vi.hoisted(() => ({
	createDeck: vi.fn(async () => ({})),
	renameDeck: vi.fn(async () => {}),
	moveDeck: vi.fn(async () => {}),
	flattenDeck: vi.fn(async () => {}),
	setInOrder: vi.fn(async () => {})
}));
vi.mock("./decks.remote.js", () => remote);
vi.mock("$app/state", () => ({ page: { data: { pageTitle: "My flashcards" } } }));
vi.mock("$app/navigation", () => ({ invalidateAll: vi.fn(async () => {}) }));

const { default: Page } = await import("./+page@.svelte");
const { default: ModalHost } = await import("$lib/components/ModalHost.svelte");

// rows as decks.getListing gives them, in reading order
const row = (id, level, parent_id, extra = {}) => ({
	id, name: id, parent_id, level, in_order: true, bought: false, instance_id: null,
	holdsDecks: false, locked: false, new: 0, learn: 0, review: 0, total: 0, ...extra
});
// Course (Ch1, Ch2) · Empty · Taken [a marketplace deck] (Inside)
const listing = () => [
	row("Course", 0, null, { holdsDecks: true, total: 5, new: 5 }),
	row("Ch1", 1, "Course", { total: 2, new: 2 }),
	row("Ch2", 1, "Course", { total: 3, new: 3, locked: true }),
	row("Empty", 0, null),
	row("Taken", 0, null, { bought: true, instance_id: "Taken", holdsDecks: true, total: 4 }),
	row("Inside", 1, "Taken", { bought: true, instance_id: "Taken", total: 4 })
];

describe("My flashcards", () => {
	const storage = () => {
		const kept = new Map();
		return { getItem: key => kept.get(key) ?? null, setItem: (key, value) => { kept.set(key, String(value)) }, removeItem: key => { kept.delete(key) } };
	}
	beforeEach(() => {
		vi.stubGlobal("localStorage", storage());
		for (const fn of Object.values(remote)) fn.mockClear();
		HTMLDialogElement.prototype.showModal ??= function () { this.open = true };
		HTMLDialogElement.prototype.close ??= function () { this.open = false; this.dispatchEvent(new Event("close")) };
	});

	const open = async (decks = listing()) => {
		const target = document.createElement("div");
		document.body.append(target);
		const host = mount(ModalHost, { target });
		const app = mount(Page, { target, props: { data: { decks, activity: { days: [], forecast: [], today: "2026-10-16" } } } });
		await tick();
		const rowEl = id => target.querySelector(`tr[data-row-id="${id}"]`);
		const buttons = within => [...(within ?? target).querySelectorAll("button")];
		const button = (label, within) => buttons(within).find(el => el.textContent.trim() === label);
		const settle = async () => { for (let i = 0; i < 5; i++) { await tick(); await new Promise(resolve => setTimeout(resolve)); } };
		return {
			target, rowEl, button, settle,
			shown: () => [...target.querySelectorAll("tr[data-row-id]")].map(tr => tr.dataset.rowId),
			menu: () => target.querySelector(".context-menu"),
			menuItems: () => buttons(target.querySelector(".context-menu")).map(el => el.textContent.trim()),
			dialog: () => target.querySelector("dialog"),
			wheel: async id => { rowEl(id).querySelector(".wheel").click(); await tick(); },
			press: async (label, within) => { button(label, within).click(); await settle(); },
			close: () => { unmount(app); unmount(host); target.remove(); }
		};
	}

	it("lists the top decks, and opens a deck onto the decks inside it", async () => {
		const page = await open();
		expect(page.shown()).toEqual(["Course", "Empty", "Taken"]);
		page.rowEl("Course").querySelector(".expander").click();
		await tick();
		expect(page.shown()).toEqual(["Course", "Ch1", "Ch2", "Empty", "Taken"]);
		// no lock on a deck progression holds shut
		expect(page.rowEl("Ch2").querySelector("[aria-label=Locked]")).toBeFalsy();
		page.close();
	})

	it("offers each kind of deck what is its to do", async () => {
		const page = await open();
		await page.wheel("Course");
		expect(page.menuItems()).toEqual(["New deck inside", "Rename", "In order", "Mixed", "Flatten", "Move to…"]);
		await page.wheel("Empty");
		expect(page.menuItems()).toEqual(["New deck inside", "Rename", "Move to…"]);
		await page.wheel("Taken");
		expect(page.menuItems()).toEqual(["Move to…", "In order", "Mixed"]);
		page.rowEl("Taken").querySelector(".expander").click();
		await tick();
		// a deck inside a marketplace deck with nothing inside it has nothing to offer
		expect(page.rowEl("Inside").querySelector(".wheel")).toBeFalsy();
		page.close();
	})

	it("offers no Flatten on a deck whose only decks inside are marketplace decks", async () => {
		const page = await open([
			row("Mine", 0, null, { holdsDecks: true, total: 4 }),
			row("Taken", 1, "Mine", { bought: true, instance_id: "Taken", total: 4 })
		]);
		await page.wheel("Mine");
		expect(page.menuItems()).toEqual(["New deck inside", "Rename", "In order", "Mixed", "Move to…"]);
		page.close();
	})

	it("makes a deck inside another, asking its name", async () => {
		const page = await open();
		await page.wheel("Course");
		await page.press("New deck inside");
		expect(page.dialog().textContent).toContain("New deck in Course");
		const input = page.dialog().querySelector("input");
		input.value = "Ch3";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await page.press("Create", page.dialog());
		expect(remote.createDeck).toHaveBeenCalledWith({ name: "Ch3", parentId: "Course" });
		page.close();
	})

	it("asks the name again when the server refuses it, saying why", async () => {
		remote.renameDeck.mockRejectedValueOnce({ body: { message: "There is already a deck with this name there" } });
		const page = await open();
		await page.wheel("Empty");
		await page.press("Rename");
		const input = page.dialog().querySelector("input");
		expect(input.value).toBe("Empty");
		input.value = "Course";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await page.press("Rename", page.dialog());
		expect(page.dialog().textContent).toContain("There is already a deck with this name there");
		expect(page.dialog().querySelector("input").value).toBe("Course");
		await page.press("Cancel", page.dialog());
		expect(remote.renameDeck).toHaveBeenCalledTimes(1);
		page.close();
	})

	it("sets in order or mixed, the one in force ticked", async () => {
		const page = await open();
		await page.wheel("Course");
		expect(page.button("In order", page.menu()).classList.contains("chosen")).toBe(true);
		await page.press("Mixed", page.menu());
		expect(remote.setInOrder).toHaveBeenCalledWith({ id: "Course", inOrder: false });
		page.close();
	})

	it("moves a deck through Move to…, anywhere but inside itself", async () => {
		const page = await open();
		await page.wheel("Course");
		await page.press("Move to…");
		const choices = [...page.dialog().querySelectorAll(".destination")].map(el => el.textContent.trim());
		expect(choices).toEqual(["Top of the list", "Empty"]);
		await page.press("Empty", page.dialog());
		await page.press("Move", page.dialog());
		expect(remote.moveDeck).toHaveBeenCalledWith({ id: "Course", parentId: "Empty", index: null });
		page.close();
	})

	it("moves a deck by dragging: inside a deck, beside one, never into a marketplace deck", async () => {
		const page = await open();
		page.rowEl("Course").querySelector(".expander").click();
		await tick();
		// rows 20px high, stacked: the pointer's place picks the row and its part
		const rows = page.shown();
		for (const [index, id] of rows.entries()) {
			page.rowEl(id).getBoundingClientRect = () => ({ top: index * 20, bottom: index * 20 + 20, height: 20, left: 0, right: 500 });
		}
		document.elementFromPoint = (x, y) => page.rowEl(rows[Math.floor(y / 20)])?.querySelector("td") ?? null;
		const drag = async (id, y) => {
			const at = rows.indexOf(id) * 20 + 10;
			page.rowEl(id).dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 10, clientY: at, bubbles: true }));
			window.dispatchEvent(new MouseEvent("mousemove", { clientX: 10, clientY: at + 8 }));
			window.dispatchEvent(new MouseEvent("mousemove", { clientX: 10, clientY: y }));
			flushSync();
			const ghost = page.target.querySelector(".drag-ghost")?.textContent.trim();
			window.dispatchEvent(new MouseEvent("mouseup", {}));
			await page.settle();
			return ghost;
		}

		// Empty dropped in the middle of Ch1: inside it
		expect(await drag("Empty", rows.indexOf("Ch1") * 20 + 10)).toBe("Empty → Ch1");
		expect(remote.moveDeck).toHaveBeenLastCalledWith({ id: "Empty", parentId: "Ch1", index: null });
		// in the top quarter of Ch2: before it, among Course's decks
		await drag("Empty", rows.indexOf("Ch2") * 20 + 2);
		expect(remote.moveDeck).toHaveBeenLastCalledWith({ id: "Empty", parentId: "Course", index: 1 });
		// in the bottom quarter of the open Course: the first deck inside it
		await drag("Empty", rows.indexOf("Course") * 20 + 18);
		expect(remote.moveDeck).toHaveBeenLastCalledWith({ id: "Empty", parentId: "Course", index: 0 });
		// a top-level row's top: at the top of the list, before it
		await drag("Ch1", rows.indexOf("Taken") * 20 + 2);
		expect(remote.moveDeck).toHaveBeenLastCalledWith({ id: "Ch1", parentId: null, index: 2 });
		// the middle of a marketplace deck is beside it, never inside
		await drag("Empty", rows.indexOf("Taken") * 20 + 12);
		expect(remote.moveDeck).toHaveBeenLastCalledWith({ id: "Empty", parentId: null, index: 2 });
		// into itself, or what is inside it: nothing happens
		const calls = remote.moveDeck.mock.calls.length;
		await drag("Course", rows.indexOf("Ch1") * 20 + 10);
		expect(remote.moveDeck.mock.calls.length).toBe(calls);
		page.close();
	})

	it("draws one line for a gap between two rows, in as far as the level the deck would land at", async () => {
		const page = await open();
		page.rowEl("Course").querySelector(".expander").click();
		await tick();
		const rows = page.shown();
		for (const [index, id] of rows.entries()) {
			page.rowEl(id).getBoundingClientRect = () => ({ top: index * 20, bottom: index * 20 + 20, height: 20, left: 0, right: 500 });
		}
		document.elementFromPoint = (x, y) => page.rowEl(rows[Math.floor(y / 20)])?.querySelector("td") ?? null;
		// the line while Taken is held at y: [the row it is drawn on, its side, its indent]
		const lineAt = y => {
			const at = rows.indexOf("Taken") * 20 + 10;
			page.rowEl("Taken").dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 10, clientY: at, bubbles: true }));
			window.dispatchEvent(new MouseEvent("mousemove", { clientX: 10, clientY: at - 8 }));
			window.dispatchEvent(new MouseEvent("mousemove", { clientX: 10, clientY: y }));
			flushSync();
			const lines = [...page.target.querySelectorAll("tr.drop-line-above, tr.drop-line-below")]
				.map(tr => [tr.dataset.rowId, tr.classList.contains("drop-line-above") ? "above" : "below", tr.style.getPropertyValue("--drop-indent")]);
			window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
			window.dispatchEvent(new MouseEvent("mouseup", {}));
			flushSync();
			return lines;
		}
		const y = (id, part) => rows.indexOf(id) * 20 + part;
		// the bottom of Ch1 and the top of Ch2 are the same gap
		expect(lineAt(y("Ch1", 18))).toEqual([["Ch2", "above", "30px"]]);
		expect(lineAt(y("Ch2", 2))).toEqual([["Ch2", "above", "30px"]]);
		// the bottom of Ch2 lands inside Course, the top of Empty at the top level
		expect(lineAt(y("Ch2", 18))).toEqual([["Empty", "above", "30px"]]);
		expect(lineAt(y("Empty", 2))).toEqual([["Empty", "above", "4px"]]);
		// just under the open Course: its first deck, one level in
		expect(lineAt(y("Course", 18))).toEqual([["Ch1", "above", "30px"]]);
		page.close();
	})

	it("drops just under an open marketplace deck before it, not after all it holds", async () => {
		const page = await open();
		page.rowEl("Taken").querySelector(".expander").click();
		await tick();
		const rows = page.shown();
		for (const [index, id] of rows.entries()) {
			page.rowEl(id).getBoundingClientRect = () => ({ top: index * 20, bottom: index * 20 + 20, height: 20, left: 0, right: 500 });
		}
		document.elementFromPoint = (x, y) => page.rowEl(rows[Math.floor(y / 20)])?.querySelector("td") ?? null;
		const from = rows.indexOf("Empty") * 20 + 10;
		page.rowEl("Empty").dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 10, clientY: from, bubbles: true }));
		window.dispatchEvent(new MouseEvent("mousemove", { clientX: 10, clientY: from + 8 }));
		window.dispatchEvent(new MouseEvent("mousemove", { clientX: 10, clientY: rows.indexOf("Taken") * 20 + 18 }));
		window.dispatchEvent(new MouseEvent("mouseup", {}));
		await page.settle();
		expect(remote.moveDeck).toHaveBeenLastCalledWith({ id: "Empty", parentId: null, index: 1 });
		page.close();
	})

	it("reads the counts again every 10 minutes while shown, and when the tab is shown again", async () => {
		const { invalidateAll } = await import("$app/navigation");
		invalidateAll.mockClear();
		let visibility = "visible";
		Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
		vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
		try {
			const page = await open();
			vi.advanceTimersByTime(10 * 60 * 1000 - 1);
			expect(invalidateAll).not.toHaveBeenCalled();
			vi.advanceTimersByTime(1);
			expect(invalidateAll).toHaveBeenCalledTimes(1);

			visibility = "hidden";
			document.dispatchEvent(new Event("visibilitychange"));
			vi.advanceTimersByTime(30 * 60 * 1000);
			expect(invalidateAll).toHaveBeenCalledTimes(1);

			visibility = "visible";
			document.dispatchEvent(new Event("visibilitychange"));
			expect(invalidateAll).toHaveBeenCalledTimes(2);

			page.close();
			vi.advanceTimersByTime(10 * 60 * 1000);
			document.dispatchEvent(new Event("visibilitychange"));
			expect(invalidateAll).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
			delete document.visibilityState;
		}
	})
})
