import { describe, it, expect, vi } from "vitest"
import { mount, unmount, tick } from "svelte"

vi.mock("$app/forms", () => ({ enhance: () => {} }));

const { default: PayoutSettings } = await import("./PayoutSettings.svelte");

const base = { email: null, name: null, currency: null, pendingEmail: null, owedCents: 0, payouts: [] };

const open = async (payouts, form = null) => {
	payouts = { ...base, ...payouts };
	const target = document.createElement("div");
	document.body.append(target);
	const app = mount(PayoutSettings, { target, props: { payouts, accountEmail: "me@example.com", form } });
	await tick();
	return {
		text: target.textContent.replace(/\s+/g, " "),
		input: target.querySelector("input[name=payout-email]"),
		name: target.querySelector("input[name=payout-name]"),
		currency: target.querySelector("select[name=payout-currency]"),
		close: () => { unmount(app); target.remove(); }
	};
};

describe("payout settings", () => {
	it("no payout email: kept earnings, the account email offered", async () => {
		const view = await open({ email: null, pendingEmail: null });
		expect(view.text).toContain("Your earnings are kept until you add one");
		expect([view.input.value, view.name.value, view.currency.value]).toEqual(["me@example.com", "", ""]);
		view.close();
	});

	it("saved details, what is owed and what was paid", async () => {
		const view = await open({
			email: "pay@example.com", name: "Ann Lee", currency: "EUR", owedCents: 1234,
			payouts: [{ id: "a", month: "October 2026", amountCents: 2500, paidAt: "2026-11-01" }, { id: "b", month: "November 2026", amountCents: 1100, paidAt: null }]
		});
		expect(view.text).toContain("Payouts go to pay@example.com");
		expect(view.text).toContain("Earned and not yet paid: $12.34");
		expect(view.text).toContain("October 2026: $25.00");
		expect(view.text).toContain("November 2026: $11.00 (being paid)");
		expect([view.input.value, view.name.value, view.currency.value]).toEqual(["pay@example.com", "Ann Lee", "EUR"]);
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
