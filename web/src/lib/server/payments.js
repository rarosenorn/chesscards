import "dotenv/config"
import Stripe from "stripe"
import { pool } from "./pool.js"
import * as marketplace from "./marketplace.js"
import { removeTaken } from "./decks.js"
import { sendMail, supportEmail } from "./mail.js"
import { formatCents } from "../money.js"

const TERMS_VERSION = "2026-11-05";
const AUTHOR_SHARE = 0.75;
// on-demand online course, written material
const TAX_CODE = "txcd_20060358";

let client;
const stripe = () => client ??= new Stripe(process.env.STRIPE_SECRET_KEY);

const siteUrl = () => process.env.BETTER_AUTH_URL ?? "http://localhost:5173";

const createCheckout = async ({ user, deck, origin }) => {
	const session = await stripe().checkout.sessions.create({
		mode: "payment",
		line_items: [{
			quantity: 1,
			price_data: {
				currency: "usd",
				unit_amount: deck.price_cents,
				tax_behavior: "inclusive",
				product_data: { name: deck.name, tax_code: TAX_CODE, metadata: { marketplaceDeckId: deck.id } }
			}
		}],
		automatic_tax: { enabled: true },
		customer_email: user.email,
		client_reference_id: user.id,
		metadata: {
			userId: user.id,
			marketplaceDeckId: deck.id,
			termsVersion: TERMS_VERSION
		},
		payment_intent_data: { metadata: { userId: user.id, marketplaceDeckId: deck.id } },
		success_url: `${origin}/marketplace/checkout-complete?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${origin}/marketplace/${deck.id}/overview`,
		integration_identifier: "deck_purchase_kqwmzrtb"
	});
	return session.url;
}

// The fee is in the balance's currency; the price and tax in the deck's
// (USD), whatever the buyer paid in.
const feeInSaleCurrency = ({ priceCents, currency }, balance) => balance.currency === currency
	? balance.fee
	: Math.round(balance.fee * priceCents / balance.amount);

const authorShare = ({ priceCents, taxCents, feeCents }) =>
	Math.max(0, Math.floor((priceCents - taxCents - feeCents) * AUTHOR_SHARE));

// Stripe attaches the fee to a payment a moment after it succeeds: the
// purchase gets it, and with it the author's share, when it is there.
const recordFee = async (paymentIntentId, balance) => {
	const { rows: [purchase] } = await pool.query(
		`select price_cents "priceCents", tax_cents "taxCents", currency from purchases
		where stripe_payment_intent_id = $1 and fee_cents is null`, [paymentIntentId]);
	if (!purchase) return false;
	const feeCents = feeInSaleCurrency(purchase, balance);
	await pool.query(
		`update purchases set fee_cents = $2, author_share_cents = $3
		where stripe_payment_intent_id = $1 and fee_cents is null`,
		[paymentIntentId, feeCents, authorShare({ ...purchase, feeCents })]);
	return true;
}

const sendConfirmation = async ({ userId, deckName, priceCents, date }) => {
	const { rows: [user] } = await pool.query('select email from "user" where id = $1', [userId]);
	if (!user) return;
	const support = supportEmail();
	const lines = [
		`Thanks for buying ${deckName} for ${formatCents(priceCents)} (VAT included). It's in My flashcards: ${siteUrl()}/my-flashcards`,
		`30-day money-back guarantee: email ${support} by ${new Date(date.getTime() + 30 * 864e5).toDateString()} and we'll refund you in full. It covers your 14-day right of withdrawal under EU law.`,
		`Terms of sale: ${siteUrl()}/terms`
	];
	await sendMail({
		to: user.email,
		replyTo: support,
		subject: `Your Chesscards purchase: ${deckName}`,
		text: lines.join("\n\n"),
		html: lines.map(line => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join("")
	});
}

// Called by Stripe's notification and by the page Stripe sends the buyer
// back to, whichever comes first; the second does nothing.
const fulfillCheckout = async (sessionId, expectedUserId) => {
	const session = await stripe().checkout.sessions.retrieve(sessionId, {
		expand: ["payment_intent.latest_charge.balance_transaction"]
	});
	if (session.status !== "complete" || session.payment_status === "unpaid") return "unpaid";
	const { userId, marketplaceDeckId, termsVersion } = session.metadata;
	if (expectedUserId && userId !== expectedUserId) return "not-yours";
	const balance = session.payment_intent?.latest_charge?.balance_transaction;

	const priceCents = session.amount_total;
	const taxCents = session.total_details?.amount_tax ?? 0;
	const feeCents = balance ? feeInSaleCurrency({ priceCents, currency: session.currency }, balance) : null;
	const result = await marketplace.recordPaidPurchase({
		userId, marketplaceDeckId, priceCents, taxCents, feeCents,
		currency: session.currency,
		authorShareCents: feeCents === null ? null : authorShare({ priceCents, taxCents, feeCents }),
		checkoutSessionId: session.id,
		paymentIntentId: session.payment_intent.id,
		termsVersion
	});
	if (result === "duplicate") {
		await stripe().refunds.create({ payment_intent: session.payment_intent.id, metadata: { reason: "deck already owned" } });
	}
	if (result === "new") {
		const deck = await marketplace.getDeckForSale(marketplaceDeckId);
		await sendConfirmation({ userId, deckName: deck?.name ?? "your deck", priceCents, date: new Date(session.created * 1000) })
			.catch(err => console.error("purchase confirmation email failed", err));
	}
	return result;
}

// A refund, or a chargeback lost: the purchase no longer counts, and the
// deck leaves the buyer's library unless they have bought it again since.
const refundPurchase = async paymentIntentId => {
	const { rows: [purchase] } = await pool.query(`
		update purchases set refunded_at = coalesce(refunded_at, now())
		where stripe_payment_intent_id = $1
		returning user_id, marketplace_deck_id`,
		[paymentIntentId]
	);
	if (!purchase?.user_id) return false;
	const { user_id: userId, marketplace_deck_id: deckId } = purchase;
	if ((await marketplace.getOwnership(userId, deckId)).owned) return true;
	await pool.query("delete from marketplace_reviews where user_id = $1 and marketplace_deck_id = $2", [userId, deckId]);
	const { rows: [instance] } = await pool.query(
		"select id from marketplace_deck_instances where user_id = $1 and marketplace_deck_id = $2", [userId, deckId]);
	if (instance) await removeTaken(userId, instance.id);
	return true;
}

const constructEvent = (body, signature) =>
	stripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);

const handleEvent = async event => {
	const object = event.data.object;
	switch (event.type) {
		case "checkout.session.completed":
		case "checkout.session.async_payment_succeeded":
			return fulfillCheckout(object.id);
		case "charge.updated":
			if (!object.balance_transaction || !event.data.previous_attributes || !("balance_transaction" in event.data.previous_attributes)) return null;
			return recordFee(object.payment_intent, await stripe().balanceTransactions.retrieve(object.balance_transaction));
		case "charge.refunded":
			return object.refunded ? refundPurchase(object.payment_intent) : null;
		case "charge.dispute.closed":
			return object.status === "lost" ? refundPurchase(object.payment_intent) : null;
		default:
			return null;
	}
}

export { TERMS_VERSION, createCheckout, fulfillCheckout, refundPurchase, constructEvent, handleEvent, authorShare }
