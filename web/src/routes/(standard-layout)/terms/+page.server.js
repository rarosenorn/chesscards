import { supportEmail } from "$lib/server/mail.js"
import { TERMS_VERSION } from "$lib/server/payments.js"

export const load = () => ({
	pageTitle: "Terms of sale",
	supportEmail: supportEmail(),
	version: TERMS_VERSION
});
