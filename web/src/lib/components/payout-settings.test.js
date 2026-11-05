import { describe, it, expect, vi } from "vitest"
import { mount, unmount, tick } from "svelte"

vi.mock("$app/forms", () => ({ enhance: () => {} }));

const { default: PayoutSettings } = await import("./PayoutSettings.svelte");

const open = async (payouts, form = null) => {
	const target = document.createElement("div");
	document.body.append(target);
	const app = mount(PayoutSettings, { target, props: { payouts, accountEmail: "me@example.com", form } });
	await tick();
	return {
		text: target.textContent.replace(/\s+/g, " "),
		input: target.querySelector("input[name=payout-email]"),
		button: target.querySelector("button").textContent.trim(),
		close: () => { unmount(app); target.remove(); }
	};
};

describe("payout settings", () => {
	it("no payout email: kept earnings, the account email offered", async () => {
		const view = await open({ email: null, pendingEmail: null });
		expect(view.text).toContain("Your earnings are kept until you add one");
		expect([view.input.value, view.button]).toEqual(["me@example.com", "Save"]);
		view.close();
	});

	it("a payout email: shown, and changed with Change", async () => {
		const view = await open({ email: "pay@example.com", pendingEmail: null });
		expect(view.text).toContain("Payouts go to pay@example.com");
		expect([view.input.value, view.button]).toEqual(["pay@example.com", "Change"]);
		view.close();
	});

	it("a new one waiting for its link, and a refused one", async () => {
		const view = await open({ email: "pay@example.com", pendingEmail: "new@example.com" },
			{ failed: "payout", errors: ["That doesn't look like an email address"] });
		expect(view.text).toContain("Check me@example.com for a link to confirm new@example.com");
		expect(view.text).toContain("That doesn't look like an email address");
		view.close();
	});
});
