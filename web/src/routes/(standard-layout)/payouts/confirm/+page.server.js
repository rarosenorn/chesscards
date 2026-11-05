import { fail } from "@sveltejs/kit"
import * as payouts from "$lib/server/payouts.js"

// the link only shows the email; the button confirms it, so a mail
// scanner opening the link changes nothing
export const load = async ({ url }) => ({
	pageTitle: "Payout email",
	email: await payouts.getPendingPayoutEmail(url.searchParams.get("token"))
});

export const actions = {
	default: async ({ url }) => {
		const email = await payouts.confirmPayoutEmail(url.searchParams.get("token"));
		if (!email) return fail(400, { expired: true });
		return { confirmed: email };
	}
};
