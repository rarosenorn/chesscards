import { supportEmail } from "$lib/server/mail.js"
import { AUTHOR_TERMS_VERSION } from "$lib/server/payments.js"

export const load = () => ({
	pageTitle: "Author agreement",
	supportEmail: supportEmail(),
	version: AUTHOR_TERMS_VERSION
});
