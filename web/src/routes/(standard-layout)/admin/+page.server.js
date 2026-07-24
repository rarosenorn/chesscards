import * as marketplace from "$lib/server/marketplace.js"

export const load = async () => ({
	pageTitle: "Admin",
	requests: await marketplace.getPendingUploadRequests()
})
