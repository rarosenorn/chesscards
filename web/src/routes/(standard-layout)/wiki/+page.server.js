import { supportEmail } from "$lib/server/mail.js"

export const load = () => {
	return { pageTitle: "Wiki", supportEmail: supportEmail() }
}
