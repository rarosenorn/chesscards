import { describe, it, expect, vi } from "vitest"
import { mount, unmount, tick } from "svelte"
import { DEFAULT_BOARD_PREFS } from "$lib/board-prefs.js"

// the form's enhance callback is kept, to be run as a submit would
const forms = vi.hoisted(() => ({ submits: [] }));
vi.mock("$app/forms", () => ({ enhance: (form, submit) => { forms.submits.push({ form, submit }); return { destroy() {} } } }));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("$lib/auth-client.js", () => ({ authClient: {} }));
vi.mock("cm-chessboard/src/Chessboard.js", () => ({ Chessboard: class { destroy() {} } }));
const { default: Page } = await import("./+page.svelte");

const open = last => {
	forms.submits.length = 0;
	const target = document.createElement("div");
	document.body.append(target);
	const app = mount(Page, { target, props: { form: null, data: {
		user: { displayName: "Me", email: "me@example.com" }, boardPrefs: DEFAULT_BOARD_PREFS, rolloverHour: 4,
		fsrs: { last, refitDays: 14 }, hasPublished: false, payouts: null, twoFactor: { required: false }
	} } });
	const section = () => [...target.querySelectorAll("section")].find(f => f.querySelector("h3")?.textContent === "Scheduling");
	return { target, section, close: () => { unmount(app); target.remove(); } };
}

describe("Settings' scheduling", () => {
	it("says how the scheduling is fitted, and when it last was", async () => {
		let view = open(null);
		expect(view.section().textContent).toContain("Not optimized yet: study uses the default parameters.");
		expect(view.section().querySelector(".section-note").textContent.replace(/\s+/g, " ")).toContain("refitted automatically every 14 days");
		view.close();

		view = open({ reviews: 1234, optimizedAt: "2026-11-16T10:00:00Z", defaults: false });
		expect(view.section().textContent).toContain("Last optimized 16 Nov 2026 from 1,234 reviews.");
		view.close();

		view = open({ reviews: 40, optimizedAt: "2026-11-16T10:00:00Z", defaults: true });
		expect(view.section().textContent).toContain("from 40 reviews, too few to fit yet: study uses the default parameters.");
		view.close();
	})

	it("optimizes now from its button, saying so while it runs", async () => {
		const view = open(null);
		await tick();
		const button = view.section().querySelector("button");
		expect(button.textContent).toBe("Optimize now");
		const { submit } = forms.submits.find(s => s.form.getAttribute("action") === "?/optimize");
		const done = submit();
		await tick();
		expect(button.textContent).toBe("Optimizing…");
		await done({ update: async () => {} });
		await tick();
		expect(button.textContent).toBe("Optimize now");
		view.close();
	})
})

describe("Settings' sections", () => {
	it("are headed as the deck's are, from the name down to the danger zone", async () => {
		const view = open(null);
		expect([...view.target.querySelectorAll(".container > section > h3")].map(h => h.textContent.trim()))
			.toEqual(["Display name", "Board", "A new day starts at", "Scheduling", "Account", "Danger zone"]);
		expect(view.target.querySelector("#display-name").labels[0].textContent).toBe("Display name");
		view.close();
	})
})
