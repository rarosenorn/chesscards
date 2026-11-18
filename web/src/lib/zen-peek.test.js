import { describe, it, expect, beforeEach } from "vitest"
import { zen, peekAt } from "./zen-state.svelte.js"

// the deck's bar as the layout draws it, with the switcher's menu open in it
const bar = () => {
	const container = document.createElement("div");
	container.className = "deck-nav-container";
	container.innerHTML = `<div class="switcher"><div class="switcher-menu"><a role="menuitem">Rook endgames</a></div></div>`;
	document.body.append(container);
	return container;
};

describe("the bars peeking back in zen mode", () => {
	beforeEach(() => {
		zen.on = true;
		zen.studying = true;
		zen.peeking = false;
	});

	it("come back at the top edge and go once the pointer is well clear of them", () => {
		peekAt(10, document.body);
		expect(zen.peeking).toBe(true);
		peekAt(100, document.body);
		expect(zen.peeking).toBe(true);
		peekAt(300, document.body);
		expect(zen.peeking).toBe(false);
	});

	it("stay while the pointer goes down the deck switcher's menu, however far", () => {
		const container = bar();
		peekAt(10, document.body);
		peekAt(400, container.querySelector("[role=menuitem]"));
		expect(zen.peeking).toBe(true);
		peekAt(400, document.body);
		expect(zen.peeking).toBe(false);
		container.remove();
	});

	it("not outside zen mode", () => {
		zen.on = false;
		peekAt(10, document.body);
		expect(zen.peeking).toBe(false);
	});
});
