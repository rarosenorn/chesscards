import { createHash, randomBytes } from "node:crypto"
import { pool } from "./pool.js"
import { sendMail, supportEmail } from "./mail.js"

const siteUrl = () => process.env.BETTER_AUTH_URL ?? "http://localhost:5173";
const hash = token => createHash("sha256").update(token).digest("hex");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sellsDecks = async userId => {
	const { rowCount } = await pool.query(
		"select 1 from marketplace_decks where user_id = $1 and price > 0 limit 1", [userId]);
	return rowCount > 0;
}

const getPayoutDetails = async userId => {
	const { rows: [details] } = await pool.query(`
		select email, case when pending_expires_at > now() then pending_email end "pendingEmail"
		from payout_details where user_id = $1`, [userId]);
	return details ?? { email: null, pendingEmail: null };
}

const mail = (to, subject, lines) => sendMail({
	to,
	replyTo: supportEmail(),
	subject,
	text: lines.join("\n\n"),
	html: lines.map(line => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`).join("")
});

// The new email takes effect once the link sent to the account's own email
// is followed, so a session alone can't redirect someone's earnings.
const requestPayoutEmail = async (user, email) => {
	email = email?.toString().trim() ?? "";
	if (email.length > 254 || !EMAIL.test(email)) return "invalid";
	const token = randomBytes(32).toString("base64url");
	await pool.query(`
		insert into payout_details (user_id, pending_email, pending_token_hash, pending_expires_at)
		values ($1, $2, $3, now() + interval '1 day')
		on conflict (user_id) do update set pending_email = excluded.pending_email,
			pending_token_hash = excluded.pending_token_hash, pending_expires_at = excluded.pending_expires_at`,
		[user.id, email, hash(token)]
	);
	await mail(user.email, "Confirm your Chesscards payout email", [
		`Confirm that Chesscards pays your marketplace earnings to ${email}: ${siteUrl()}/payouts/confirm?token=${token}`,
		"The link works for a day. If you didn't ask for this, ignore this email; nothing changes."
	]);
	return "sent";
}

const getPendingPayoutEmail = async token => {
	if (!token) return null;
	const { rows: [pending] } = await pool.query(`
		select pending_email "email" from payout_details
		where pending_token_hash = $1 and pending_expires_at > now()`, [hash(token)]);
	return pending?.email ?? null;
}

const confirmPayoutEmail = async token => {
	if (!token) return null;
	const { rows: [changed] } = await pool.query(`
		update payout_details p set email = p.pending_email, changed_at = now(),
			pending_email = null, pending_token_hash = null, pending_expires_at = null
		from (select user_id, email from payout_details
			where pending_token_hash = $1 and pending_expires_at > now() for update) old
		where p.user_id = old.user_id
		returning p.email, old.email "oldEmail"`, [hash(token)]);
	if (!changed) return null;
	if (changed.oldEmail && changed.oldEmail.toLowerCase() !== changed.email.toLowerCase()) {
		await mail(changed.oldEmail, "Your Chesscards payout email was changed", [
			`Your Chesscards marketplace earnings will now be paid to ${changed.email}, not to this address.`,
			"If you didn't do this, reply to this email right away."
		]).catch(err => console.error("payout change notice failed", err));
	}
	return changed.email;
}

export { sellsDecks, getPayoutDetails, requestPayoutEmail, getPendingPayoutEmail, confirmPayoutEmail }
