// @vitest-environment node
// Change requests against a real database: a scratch one built from
// sql/init.sql for this file and dropped after it. Skipped when Postgres
// can't be reached.
import "dotenv/config"
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import pg from "pg"

const NAME = `cc_test_change_requests_${process.pid}`;
const server = new pg.Client({ database: "postgres" });
const reachable = await server.connect().then(() => true, () => false);

const A = "00000000-0000-4000-8000-00000000000a";
const OTHER = "00000000-0000-4000-8000-00000000000c";
const DECK = "00000000-0000-4000-8000-0000000000a1";
const card = n => `00000000-0000-4000-8000-0000000000c${n}`;
const text = words => [{ type: "text", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: words }] }] } }];

let m, pool;

describe.skipIf(!reachable)("change requests", () => {
	beforeAll(async () => {
		await server.query(`drop database if exists ${NAME}`);
		await server.query(`create database ${NAME}`);
		const setup = new pg.Client({ database: NAME });
		await setup.connect();
		await setup.query(readFileSync(new URL("../../../../sql/init.sql", import.meta.url), "utf8"));
		await setup.end();
		process.env.PGDATABASE = NAME;
		m = await import("./marketplace.js");
		({ pool } = await import("./pool.js"));
	});

	afterAll(async () => {
		await pool?.end();
		await server.query(`drop database if exists ${NAME}`);
		await server.end();
	});

	beforeEach(async () => {
		await pool.query(`
			truncate "user", marketplace_decks cascade;
			insert into "user"(id, name, email, "emailVerified") values ($1, 'Author', 'a@x', true), ($2, 'Other', 'c@x', true);
			insert into marketplace_decks(id, user_id, name, slug, description, price, theme, image, image_type) values
				($3, $1, 'Alpha Deck', 'alpha-deck', $4, 10, 'openings', '\\x00', 'image/png'),
				('00000000-0000-4000-8000-0000000000a2', $2, 'Beta Deck', 'beta-deck', '[]', 0, 'openings', '\\x00', 'image/png');
			insert into marketplace_cards(id, marketplace_deck_id, position, front, preview_order) values
				($5, $3, 1, '[]', 1), ($6, $3, 2, '[]', null);`.replace(/\$(\d)/g, (_, i) => [null, `'${A}'`, `'${OTHER}'`, `'${DECK}'`, `'${JSON.stringify(text("Live"))}'`, `'${card(1)}'`, `'${card(2)}'`][i])
		);
	});

	const live = { name: "Alpha Deck", description: text("Live"), previewCardIds: [card(1)] };
	const deckNow = async () => (await pool.query(
		"select name, slug, description->0->'content'->'content'->0->'content'->0->>'text' words, image from marketplace_decks where id = $1", [DECK])).rows[0];

	it("approving takes only the parts asked for", async () => {
		await m.requestChanges(A, DECK, { ...live, name: "Alpha Two", previewCardIds: [card(2), card(2)] });
		const request = await m.getChangeRequest(DECK);
		expect(request.parts).toEqual(["name", "sample cards"]);
		await m.approveChangeRequest(request.id);
		const deck = await deckNow();
		expect([deck.name, deck.slug, deck.words]).toEqual(["Alpha Two", "alpha-two", "Live"]);
		expect((await m.getDeckPreviewCards(DECK)).map(c => c.id)).toEqual([card(2)]);
		expect(await m.getChangeRequest(DECK)).toBe(undefined);
	});

	it("only the author asks, and not for the page as it is, nor for another deck's name", async () => {
		expect(await m.requestChanges(OTHER, DECK, { ...live, name: "Hijack" })).toBe(false);
		await expect(m.requestChanges(A, DECK, live)).rejects.toThrow("Nothing is changed");
		await expect(m.requestChanges(A, DECK, { ...live, name: "Beta Deck" })).rejects.toThrow('There is already a marketplace deck named "Beta Deck"');
	});

	it("a request the author replaces while an admin looks at it can't be approved as the admin saw it", async () => {
		await m.requestChanges(A, DECK, { ...live, name: "Harmless" });
		const seen = await m.getChangeRequest(DECK);
		await m.requestChanges(A, DECK, { ...live, description: text("Something else") });
		await expect(m.approveChangeRequest(seen.id)).rejects.toThrow("Request not found or not pending");
		expect(await m.rejectChangeRequest(seen.id, "no")).toBe(false);
		expect((await deckNow()).words).toBe("Live");
		expect((await m.getChangeRequest(DECK)).parts).toEqual(["description"]);
	});

	it("asking for the page as it is takes back the changes waiting", async () => {
		await m.requestChanges(A, DECK, { ...live, name: "Alpha Two" });
		expect(await m.requestChanges(A, DECK, live)).toBe(true);
		expect(await m.getChangeRequest(DECK)).toBe(undefined);
	});

	it("taking changes back leaves no note of an earlier rejection", async () => {
		await m.requestChanges(A, DECK, { ...live, name: "Alpha Two" });
		await m.rejectChangeRequest((await m.getChangeRequest(DECK)).id, "no");
		await m.requestChanges(A, DECK, { ...live, name: "Alpha Three" });
		await m.requestChanges(A, DECK, live);
		expect(await m.getChangeRequest(DECK)).toBe(undefined);
	});

	it("asking again keeps the thumbnail waiting when told to", async () => {
		await m.requestChanges(A, DECK, { ...live, image: Buffer.from([1, 2]), imageType: "image/png" });
		await m.requestChanges(A, DECK, { ...live, keepPendingImage: true, name: "Alpha Two" });
		const request = await m.getChangeRequest(DECK);
		expect(request.parts).toEqual(["name", "thumbnail"]);
		await m.approveChangeRequest(request.id);
		expect([...(await deckNow()).image]).toEqual([1, 2]);
	});
});
