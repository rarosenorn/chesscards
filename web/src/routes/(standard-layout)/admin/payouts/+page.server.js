import { fail } from "@sveltejs/kit"
import * as payouts from "$lib/server/payouts.js"
import { fillMissingFees } from "$lib/server/payments.js"

export const load = async () => {
	await fillMissingFees().catch(err => console.error("filling missing fees failed", err));
	const periodEnd = payouts.periodEndNow();
	return {
		pageTitle: "Payouts",
		month: payouts.monthBefore(periodEnd),
		periodEnd: periodEnd.toISOString(),
		due: await payouts.getDue(periodEnd),
		...await payouts.getPayouts()
	};
}

export const actions = {
	prepare: async () => {
		try {
			await fillMissingFees();
			return { prepared: await payouts.preparePayouts(payouts.periodEndNow()) };
		} catch (err) {
			return fail(409, { errors: [err.message] });
		}
	},
	paid: async () => ({ paid: await payouts.markPaid() }),
	cancel: async ({ request }) => {
		if (!await payouts.cancelPayout((await request.formData()).get("id"))) {
			return fail(409, { errors: ["Only an author's latest payout can be undone"] });
		}
	}
}
