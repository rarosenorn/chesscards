import { fail } from "@sveltejs/kit"
import * as payouts from "$lib/server/payouts.js"

export const load = async () => {
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
			return { prepared: await payouts.preparePayouts(payouts.periodEndNow()) };
		} catch (err) {
			return fail(409, { errors: [err.message] });
		}
	},
	paid: async () => ({ paid: await payouts.markPaid() }),
	cancel: async ({ request }) => {
		await payouts.cancelPayout((await request.formData()).get("id"));
	}
}
