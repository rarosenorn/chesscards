// The add-cards tab's client-side persistence: the in-progress card and the
// card type, both per deck, both in localStorage. They survive switching deck
// tabs, leaving the deck entirely and a reload — nothing the user typed is
// thrown away by navigation, which is why the deck layout shows no unsaved-
// changes warning for this tab.
const draftKey = deckId => `chesscards:add-cards-draft:${deckId}`;
const cardTypeKey = deckId => `chesscards:card-type:${deckId}`;
const frozenKey = deckId => `chesscards:frozen-sides:${deckId}`;
const stageKey = deckId => `chesscards:add-cards-stage:${deckId}`;

// Anki-style mode: applies to every card added until changed
const CARD_TYPES = ["basic", "tactic"];
const DEFAULT_CARD_TYPE = "basic";

// localStorage is absent during SSR and throws outright in a locked-down
// browser (private mode, quota, storage blocked). A draft is a convenience:
// losing one must never take the page down with it.
const read = key => {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}
const write = (key, value) => {
	try {
		localStorage.setItem(key, value);
	} catch {
		// nothing to do: the card stays in the editor, only its backup is lost
	}
}
const remove = key => {
	try {
		localStorage.removeItem(key);
	} catch {
		// see write()
	}
}

const loadCardType = deckId => {
	const stored = read(cardTypeKey(deckId));
	return CARD_TYPES.includes(stored) ? stored : DEFAULT_CARD_TYPE;
}

const saveCardType = (deckId, cardType) => write(cardTypeKey(deckId), cardType);

// the two tiptap documents as stored by saveDraft, or null when there is no
// draft (or the stored one is unreadable — a half-written or stale entry is
// dropped rather than fed to the editors)
const loadDraft = deckId => {
	const stored = read(draftKey(deckId));
	if (!stored) return null;
	try {
		const draft = JSON.parse(stored);
		return draft?.front || draft?.back ? draft : null;
	} catch {
		remove(draftKey(deckId));
		return null;
	}
}

const saveDraft = (deckId, front, back) => write(draftKey(deckId), JSON.stringify({ front, back }));

const clearDraft = deckId => remove(draftKey(deckId));

// A frozen side survives the submit that files a card, so a run of cards can
// share a position or a stem (Anki's frozen fields). Like the card type, this
// is how the deck is being written rather than what is in the card, so it
// outlives the draft it applies to.
const loadFrozenSides = deckId => {
	try {
		const stored = JSON.parse(read(frozenKey(deckId)));
		return { front: stored?.front === true, back: stored?.back === true };
	} catch {
		return { front: false, back: false };
	}
}

const saveFrozenSides = (deckId, frozen) =>
	write(frozenKey(deckId), JSON.stringify({ front: !!frozen.front, back: !!frozen.back }));

// which stage new cards are filed into, like the card type a mode of writing
// the deck; the page falls back to the last stage when the stored one is gone
const loadStageId = deckId => read(stageKey(deckId));

const saveStageId = (deckId, stageId) => write(stageKey(deckId), stageId);

export {
	DEFAULT_CARD_TYPE, loadCardType, saveCardType, loadDraft, saveDraft, clearDraft,
	loadFrozenSides, saveFrozenSides,
	loadStageId, saveStageId
}
