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

const open = (last, { form = null, timeZone = "UTC" } = {}) => {
	forms.submits.length = 0;
	const target = document.createElement("div");
	document.body.append(target);
	const app = mount(Page, { target, props: { form, data: {
		user: { displayName: "Me", email: "me@example.com" }, boardPrefs: DEFAULT_BOARD_PREFS, rolloverHour: 4, desiredRetention: 0.9,
		fsrs: { last, refitDays: 14, timeZone }, hasPublished: false, payouts: null, twoFactor: { required: false }
	} } });
	const section = () => [...target.querySelectorAll("section")].find(f => f.querySelector("h3")?.textContent === "Spaced repetition parameter optimization");
	return { target, section, close: () => { unmount(app); target.remove(); } };
}

describe("Settings' scheduling", () => {
	it("says how the scheduling is fitted, and when it last was", async () => {
		let view = open(null);
		expect(view.section().textContent).toContain("Not optimized yet: study uses the default parameters.");
		expect(view.section().querySelector(".section-note").textContent.replace(/\s+/g, " ")).toContain("automatically optimized 14 days after the previous optimization");
		view.close();

		view = open({ reviews: 1234, optimizedAt: "2026-11-16T10:00:00Z", defaults: false });
		expect(view.section().textContent).toContain("Last optimized 16 Nov 2026 from 1,234 reviews.");
		view.close();

		view = open({ reviews: 40, optimizedAt: "2026-11-16T10:00:00Z", defaults: true });
		expect(view.section().textContent).toContain("from 40 reviews; the default parameters are still in use.");
		view.close();
	})

	it("dates the last optimization in the user's own zone, wherever the page is drawn", async () => {
		const view = open({ reviews: 900, optimizedAt: "2026-11-16T02:00:00Z", defaults: false }, { timeZone: "America/Los_Angeles" });
		expect(view.section().textContent).toContain("Last optimized 15 Nov 2026");
		view.close();
	})

	it("says a failed optimization in its own section only", async () => {
		const view = open(null, { form: { failed: "optimize", errors: ["Optimizing failed. Try again."] } });
		expect([...view.target.querySelectorAll(".error")].map(e => e.closest("section").querySelector("h3").textContent))
			.toEqual(["Spaced repetition parameter optimization"]);
		view.close();
	})

	it("optimizes now from its button, saying so while it runs", async () => {
		const view = open(null);
		await tick();
		const button = view.section().querySelector("button");
		expect(button.textContent).toBe("Optimize parameters");
		const { submit } = forms.submits.find(s => s.form.getAttribute("action") === "?/optimize");
		const done = submit();
		await tick();
		expect(button.textContent).toBe("Optimizing…");
		await done({ update: async () => {} });
		await tick();
		expect(button.textContent).toBe("Optimize parameters");
		view.close();
	})
})

describe("Settings' sections", () => {
	it("are headed as the deck's are, from the name down to the danger zone", async () => {
		const view = open(null);
		expect([...view.target.querySelectorAll(".container > section > h3")].map(h => h.textContent.trim()))
			.toEqual(["Display name", "Board", "A new day starts at", "Desired retention", "Spaced repetition parameter optimization", "Account", "Danger zone"]);
		expect(view.target.querySelector("#display-name").labels[0].textContent).toBe("Display name");
		view.close();
	})
})

describe("Settings' desired retention", () => {
	it("offers 80% to 97%, the user's own choice marked, and saves a new one at once", async () => {
		const view = open(null);
		await tick();
		const section = [...view.target.querySelectorAll("section")].find(f => f.querySelector("h3")?.textContent === "Desired retention");
		expect([...section.querySelectorAll(".pill")].map(p => p.textContent.trim())).toEqual(["80%", "85%", "90%", "95%", "97%"]);
		expect(section.querySelector(".pill.selected").textContent.trim()).toBe("90%");
		const form = section.querySelector("form");
		form.requestSubmit = vi.fn();
		section.querySelectorAll("input")[3].click();
		await tick();
		expect(form.requestSubmit).toHaveBeenCalled();
		expect(section.querySelector(".pill.selected").textContent.trim()).toBe("95%");
		view.close();
	})
})
