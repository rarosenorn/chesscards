import { error, json } from "@sveltejs/kit"
import * as payments from "$lib/server/payments.js"

export const POST = async ({ request }) => {
	const body = await request.text();
	let event;
	try {
		event = payments.constructEvent(body, request.headers.get("stripe-signature"));
	} catch {
		error(400, "Invalid signature");
	}
	await payments.handleEvent(event);
	return json({ received: true });
}
