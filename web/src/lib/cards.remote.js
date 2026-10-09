import { getRequestEvent, command } from "$app/server"
import { error } from "@sveltejs/kit"
import { createEmptyCard } from "ts-fsrs"
import * as decks from "$lib/server/decks.js"
import * as marketplace from "$lib/server/marketplace.js"
import * as activity from "$lib/server/activity.js"
import { checkIds, checkIdList } from "$lib/server/ids.js"
import { DEFAULT_ROLLOVER_HOUR, TZ_COOKIE } from "$lib/rollover.js"

// What is done to a card from wherever it is shown: study grades it, and
// study and the Cards tab both edit and delete it.

export const updateCardStudyStateAndAddLog =
	command("unchecked", async ({ card, log }) => {
		const { locals } = getRequestEvent();
		if (!card || !log) error(400, "Bad request");
		checkIds(card.id);

		// marketplace card instances carry marketplace_deck_instance_id instead of deck_id
		if (card.marketplace_deck_instance_id) {
			if (!await marketplace.updateInstanceCardStudyState(locals.userId, card)) {
				error(403, "Unauthorized");
			}
			await marketplace.createInstanceReviewLog(locals.userId, card.id, log);
			return;
		}

		if (!await decks.updateCardStudyState(locals.userId, card)) {
			error(403, "Unauthorized");
		}
		await decks.createReviewLog(locals.userId, card.id, log);
	})

// an answer given as practice in a cram session: it changes nothing about
// the card, and is kept only as study done that day
export const logPractice =
	command("unchecked", async ({ cardId, instance, gotIt }) => {
		const { locals } = getRequestEvent();
		checkIds(cardId);
		if (!await activity.logPractice(locals.userId, cardId, !!instance, !!gotIt)) {
			error(403, "Unauthorized");
		}
	})

// a cram session gone through to the end, on a deck (or a marketplace deck
// taken, or a metadeck) or one subdeck of it: the answer is how many that
// makes there today, by the user's own day (their zone and rollover hour, as
// the deck list reads them)
export const completeCramSession =
	command("unchecked", async ({ studiedId, subdeckId }) => {
		const { locals, cookies } = getRequestEvent();
		if (!locals.userId) error(403, "Unauthorized");
		checkIds(studiedId, subdeckId ?? []);
		return activity.completeCramSession(locals.userId, studiedId, subdeckId ?? null, {
			timeZone: cookies.get(TZ_COOKIE) || Intl.DateTimeFormat().resolvedOptions().timeZone,
			rolloverHour: locals.user?.rolloverHour ?? DEFAULT_ROLLOVER_HOUR
		});
	})

export const updateCardContent =
	command("unchecked", async ({ cardId, front, back }) => {
		const { locals } = getRequestEvent();
		checkIds(cardId);
		if (!await decks.updateCardContent(locals.userId, cardId, front, back)) {
			error(403, "Unauthorized");
		}
	})

// the updated card goes back to the client, which puts it into the shared
// deck context — the row's Due/Reps/State follow the new type at once
export const updateCardType =
	command("unchecked", async ({ cardId, cardType }) => {
		const { locals } = getRequestEvent();
		checkIds(cardId);
		const type = cardType === "tactic" ? "tactic" : "basic";
		const card = await decks.updateCardType(locals.userId, cardId, type, Object.values(createEmptyCard()));
		if (!card) error(403, "Unauthorized");
		return card;
	})

export const deleteCards =
	command("unchecked", async ({ cardIds }) => {
		const { locals } = getRequestEvent();
		checkIdList(cardIds);
		if (await decks.deleteCards(locals.userId, cardIds) === 0) {
			error(403, "Unauthorized");
		}
	})
