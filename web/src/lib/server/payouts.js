import { createHash, randomBytes } from "node:crypto"
import { pool } from "./pool.js"
import { sendMail, supportEmail } from "./mail.js"
import { PAYOUT_CURRENCIES } from "../payout-currencies.js"
import { formatCents } from "../money.js"

const siteUrl = () => process.env.BETTER_AUTH_URL ?? "http://localhost:5173";
const hash = token => createHash("sha256").update(token).digest("hex");
// starting with a letter or digit, so a spreadsheet opening the Wise batch
// file reads it as text, not a formula
const EMAIL = /^[\p{L}\p{N}][^\s@,;"]*@[^\s@,;"]+\.[^\s@,;"]+$/u;
const NAME = /^\p{L}[\p{L}\p{M}\p{N} .,'’&()-]*$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sellsDecks = async userId => {
	const { rowCount } = await pool.query(
		"select 1 from marketplace_decks where user_id = $1 and price > 0 limit 1", [userId]);
	return rowCount > 0;
}

const getPayoutDetails = async userId => {
	const { rows: [details] } = await pool.query(`
		select email, name, currency, case when pending_expires_at > now() then pending_email end "pendingEmail"
		from payout_details where user_id = $1`, [userId]);
	return details ?? { email: null, name: null, currency: null, pendingEmail: null };
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

// name and currency are saved as given; a new email waits for its link
const savePayoutDetails = async (user, { email, name, currency }) => {
	name = name?.toString().trim() ?? "";
	if (!name || name.length > 100 || !NAME.test(name)) return "Give the name on your bank account";
	if (!PAYOUT_CURRENCIES.includes(currency)) return "Choose your bank account's currency";
	email = email?.toString().trim() ?? "";
	if (email.length > 254 || !EMAIL.test(email)) return "That doesn't look like an email address";
	const { rows: [saved] } = await pool.query(`
		insert into payout_details (user_id, name, currency) values ($1, $2, $3)
		on conflict (user_id) do update set name = excluded.name, currency = excluded.currency
		returning email`, [user.id, name, currency]);
	if (saved.email?.toLowerCase() === email.toLowerCase()) return "saved";
	await requestPayoutEmail(user, email);
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

const MINIMUM_CENTS = 1000;
const AUTHOR = "coalesce(md.user_id, md.former_author_id)";

// each purchase's part in what an author is owed: a sale not yet paid
// (before the given time, if any) is its share; a paid sale since refunded,
// not yet taken back, is its share taken back
const lines = before => `
	select ${AUTHOR} author_id, p.id, case
		when p.payout_id is null and p.refunded_at is null and p.author_share_cents is not null
			${before ? `and p.created_at < ${before}` : ""} then p.author_share_cents
		when p.payout_id is not null and p.refunded_at is not null and p.clawback_payout_id is null
			then -p.author_share_cents
	end amount
	from purchases p join marketplace_decks md on md.id = p.marketplace_deck_id`;

const periodEndNow = () => {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

const monthBefore = periodEnd => new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, 1))
	.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

// every author owed something for the sales before periodEnd, with whether
// they are paid now or it rolls over, and why
const getDue = async (periodEnd, client = pool) => {
	const { rows } = await client.query(`
		with l as (${lines("$1::timestamptz")}),
		totals as (
			select author_id, count(*) filter (where amount > 0)::int sales,
				coalesce(sum(amount) filter (where amount > 0), 0)::int earned,
				coalesce(-sum(amount) filter (where amount < 0), 0)::int refunds,
				sum(amount)::int total
			from l where amount is not null and author_id is not null group by author_id
		)
		select t.author_id "authorId", t.sales, t.earned, t.refunds, t.total,
			coalesce(u.name, (select author_name from marketplace_decks where former_author_id = t.author_id limit 1)) author,
			u.id is null deleted, pd.email, pd.name, pd.currency, pd.changed_at "changedAt",
			(select max(paid_at) from payouts where author_id = t.author_id) "lastPaidAt"
		from totals t
		left join "user" u on u.id = t.author_id
		left join payout_details pd on pd.user_id = t.author_id
		order by t.total desc`, [periodEnd.toISOString()]);
	// a deleted author's refunds can't be taken from anything
	return rows.filter(row => !(row.deleted && row.total <= 0)).map(row => ({
		...row,
		emailChanged: Boolean(row.changedAt && row.lastPaidAt && row.changedAt > row.lastPaidAt),
		firstPayout: !row.lastPaidAt,
		rollsOver: !row.email || !row.name || !row.currency ? "no payout details"
			: row.total <= 0 ? "refunds exceed sales"
			: row.total < MINIMUM_CENTS && !row.deleted ? `under ${formatCents(MINIMUM_CENTS)}`
			: null
	}));
}

// a payout for each author paid now, holding the sales and refunds it pays
const preparePayouts = async periodEnd => {
	const client = await pool.connect();
	try {
		await client.query("begin");
		await client.query("lock table payouts in exclusive mode");
		let count = 0;
		for (const due of (await getDue(periodEnd, client)).filter(row => !row.rollsOver)) {
			const { rows: [payout] } = await client.query(`
				insert into payouts (author_id, period_end, amount_cents, email, name, currency)
				values ($1, $2, $3, $4, $5, $6) returning id`,
				[due.authorId, periodEnd.toISOString().slice(0, 10), due.total, due.email, due.name, due.currency]);
			await client.query(`
				update purchases p set payout_id = $2 from marketplace_decks md
				where md.id = p.marketplace_deck_id and ${AUTHOR} = $1
					and p.payout_id is null and p.refunded_at is null and p.author_share_cents is not null
					and p.created_at < $3::timestamptz`, [due.authorId, payout.id, periodEnd.toISOString()]);
			await client.query(`
				update purchases p set clawback_payout_id = $2 from marketplace_decks md
				where md.id = p.marketplace_deck_id and ${AUTHOR} = $1
					and p.payout_id is not null and p.payout_id <> $2 and p.refunded_at is not null
					and p.clawback_payout_id is null`, [due.authorId, payout.id]);
			const { rows: [linked] } = await client.query(`
				select coalesce(sum(author_share_cents) filter (where payout_id = $1), 0)
					- coalesce(sum(author_share_cents) filter (where clawback_payout_id = $1), 0) amount
				from purchases where payout_id = $1 or clawback_payout_id = $1`, [payout.id]);
			if (Number(linked.amount) !== due.total) throw new Error("Sales changed while preparing the payouts; prepare them again");
			count++;
		}
		await client.query("commit");
		return count;
	} catch (err) {
		await client.query("rollback");
		throw err;
	} finally {
		client.release();
	}
}

const PAYOUT_FIELDS = `p.id, p.period_end::text "periodEnd", p.amount_cents "amountCents", p.email, p.name, p.currency,
	p.created_at "createdAt", p.paid_at "paidAt"`;

// latest: only an author's latest payout can be undone, so a refund taken
// from a later one is never taken twice
const getPayouts = async () => {
	const { rows } = await pool.query(`
		select ${PAYOUT_FIELDS},
			coalesce(u.name, (select author_name from marketplace_decks where former_author_id = p.author_id limit 1)) author,
			not exists (select 1 from payouts later where later.author_id = p.author_id and later.created_at > p.created_at) latest,
			(select count(*)::int from purchases where payout_id = p.id and refunded_at is not null) "refundedSales"
		from payouts p left join "user" u on u.id = p.author_id
		order by p.paid_at desc nulls first, p.created_at desc
		limit 200`);
	return {
		prepared: rows.filter(row => !row.paidAt),
		paid: rows.filter(row => row.paidAt)
	};
}

// Wise's "send by email" batch: each author is sent the dollar amount,
// converted to their currency, Wise's fee taken from it
const wiseBatchCsv = async () => {
	const { prepared } = await getPayouts();
	const cell = value => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
	const rows = prepared.map(p => [
		p.name, p.email, `Chesscards ${monthBefore(new Date(p.periodEnd))}`, "PERSON", "source",
		(p.amountCents / 100).toFixed(2), "USD", p.currency
	].map(String).map(cell).join(","));
	return ["name,recipientEmail,paymentReference,receiverType,amountCurrency,amount,sourceCurrency,targetCurrency", ...rows].join("\n") + "\n";
}

const markPaid = async () => {
	const { rows } = await pool.query(`
		update payouts set paid_at = now() where paid_at is null
		returning author_id "authorId", amount_cents "amountCents", period_end::text "periodEnd", email`);
	for (const payout of rows) {
		await mail(payout.email, "Your Chesscards earnings are on their way", [
			`We have sent you ${formatCents(payout.amountCents)}, your share of your Chesscards decks' sales in ${monthBefore(new Date(payout.periodEnd))}, by Wise.`,
			"Wise emails you at this address to collect it into your bank account."
		]).catch(err => console.error("payout email failed", err));
	}
	// a deleted author's payout email is kept only until they are paid all they are owed
	await pool.query(`
		delete from payout_details pd
		where not exists (select 1 from "user" u where u.id = pd.user_id)
			and not exists (select 1 from (${lines()}) l where l.author_id = pd.user_id and l.amount > 0)`);
	return rows.length;
}

const cancelPayout = async id => {
	if (!UUID.test(id ?? "")) return false;
	const { rowCount } = await pool.query(`
		delete from payouts p where p.id = $1
			and not exists (select 1 from payouts later where later.author_id = p.author_id and later.created_at > p.created_at)`,
		[id]);
	return rowCount === 1;
}

// what the author is owed so far, this month's sales included, and what
// they have been paid
const getEarnings = async userId => {
	const { rows: [owed] } = await pool.query(`
		select coalesce(sum(amount), 0)::int "owedCents" from (${lines()}) l
		where l.author_id = $1 and l.amount is not null`, [userId]);
	const { rows: payouts } = await pool.query(`
		select ${PAYOUT_FIELDS} from payouts p where p.author_id = $1 order by p.period_end desc`, [userId]);
	return {
		owedCents: owed.owedCents,
		payouts: payouts.map(p => ({ ...p, month: monthBefore(new Date(p.periodEnd)) }))
	};
}

export {
	sellsDecks, getPayoutDetails, savePayoutDetails, requestPayoutEmail, getPendingPayoutEmail, confirmPayoutEmail,
	MINIMUM_CENTS, periodEndNow, monthBefore, getDue, preparePayouts, getPayouts, wiseBatchCsv, markPaid, cancelPayout, getEarnings
}
