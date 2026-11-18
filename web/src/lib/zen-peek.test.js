import { describe, it, expect, beforeEach } from "vitest"
import { zen, zenHidden, peekAt, carryZenTo, resetZen } from "./zen-state.svelte.js"

describe("the bars in zen mode", () => {
	beforeEach(() => {
		resetZen(null);
		zen.on = true;
		zen.studying = true;
	});

	it("come back at the top edge and go once the pointer is well clear of them", () => {
		expect(zenHidden()).toBe(true);
		peekAt(10);
		expect(zenHidden()).toBe(false);
		peekAt(100);
		expect(zenHidden()).toBe(false);
		peekAt(300);
		expect(zenHidden()).toBe(true);
	});

	it("stay while the deck switcher's menu is open, wherever the pointer goes, and go when it closes", () => {
		peekAt(10);
		zen.choosing = true;
		peekAt(600);
		expect(zenHidden()).toBe(false);
		zen.choosing = false;
		expect(zenHidden()).toBe(true);
	});

	it("a deck chosen from the switcher in zen opens in zen; any other study page opens out of it", () => {
		carryZenTo("/my-flashcards/own/study");
		resetZen("/my-flashcards/own/study");
		expect([zen.on, zen.choosing, zen.peeking]).toEqual([true, false, false]);
		carryZenTo("/my-flashcards/own/study");
		resetZen("/my-flashcards/beside/study");
		expect(zen.on).toBe(false);
		// once only: the next visit starts out of zen
		resetZen("/my-flashcards/own/study");
		expect(zen.on).toBe(false);
	});

	it("a deck chosen out of zen opens out of it", () => {
		zen.on = false;
		carryZenTo("/my-flashcards/own/study");
		resetZen("/my-flashcards/own/study");
		expect(zen.on).toBe(false);
	});

	it("nothing peeks outside zen mode", () => {
		zen.on = false;
		peekAt(10);
		expect(zen.peeking).toBe(false);
	});
});
