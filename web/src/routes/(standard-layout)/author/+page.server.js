import { error, fail } from "@sveltejs/kit"
import * as marketplace from "$lib/server/marketplace.js"
import * as payouts from "$lib/server/payouts.js"
import { dayOf } from "$lib/server/fsrs-optimizer.js"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load = async ({ locals, cookies }) => {
	if (!locals.userId) error(404);
	const { decks, requests } = await marketplace.getAuthorDecks(locals.userId);
	return {
		pageTitle: "Your marketplace decks",
		decks,
		requests,
		sales: await marketplace.getAuthorSales(locals.userId),
		payouts: await payouts.sellsDecks(locals.userId)
			? { ...await payouts.getPayoutDetails(locals.userId), ...await payouts.getEarnings(locals.userId) }
			: null,
		timeZone: dayOf({ locals, cookies }).timeZone
	};
}

export const actions = {
	onSale: async ({ request, locals }) => {
		const data = await request.formData();
		const deckId = data.get("deckId")?.toString() ?? "";
		const onSale = data.get("on-sale") === "true";
		if (!locals.userId || !UUID.test(deckId) || !await marketplace.setOnSale(locals.userId, deckId, onSale)) {
			return fail(404, { errors: ["No such deck of yours on the marketplace"] });
		}
	},
	payoutDetails: async ({ request, locals }) => {
		if (!locals.userId || !await payouts.sellsDecks(locals.userId)) return fail(403, { failed: "payout", errors: ["Payouts are for authors of paid marketplace decks"] });
		const data = await request.formData();
		const result = await payouts.savePayoutDetails(locals.user, {
			email: data.get("payout-email"),
			name: data.get("payout-name"),
			currency: data.get("payout-currency")
		});
		if (result !== "saved" && result !== "sent") return fail(400, { failed: "payout", errors: [result] });
		return { saved: "payout" };
	}
}
