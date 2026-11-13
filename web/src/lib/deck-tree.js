// Decks inside decks, as Anki nests them. A deck is { id, parent_id, name,
// position, in_order }: parent_id names the deck it sits inside (null, or a
// deck not in the list, at the top), position its place among its siblings.
// A deck holds cards and decks both, its own cards coming first. A card says
// which deck it sits in by its deck_id.
//
// A deck that has decks inside it either takes them in order (in_order: each
// unlocks once the one before has passed, its own cards counting as the
// first) or mixed (all open, new cards taken from each in turn). That is the
// deck's own say, wherever study starts from.
//
// Progression is computed from card state alone: no stored unlock flag, so
// resetting a deck locks its later decks again by itself. A deck passes when
// every card under it has been seen and at least GRADUATED_SHARE of them have
// graduated. Graduated means proved once — Review or Relearning, never
// Learning: a lapse (Review -> Relearning) cannot lock a deck already passed,
// and short of a reset no card returns to Learning or New. Progression gates
// only new cards: a card already seen keeps coming round whatever its deck.

const GRADUATED_SHARE = 0.8;

// a tactic card carries no FSRS state; its grades stamp last_review
// (seen) and reps (its ladder rung). It graduates on its first climb —
// finishing the ladder takes months, too long to hold a deck shut. An
// article has no state either: read, it is finished, so seen and graduated
// at once.
const isSeen = card => card.card_type === "basic"
	? card.state !== 0
	: card.finished_at != null || card.last_review != null;

const isGraduated = card => card.card_type === "basic"
	? card.state === 2 || card.state === 3
	: card.finished_at != null || (card.reps ?? 0) > 0;

// A tactic card's ladder: the days a solve waits, step by step; one more
// solve after the last retires the card. A deck's own, or else the nearest
// deck above's, or else the default. byId: the library's decks by id.
const DEFAULT_TACTIC_LADDER = [14, 60, 180];
const tacticLadder = (byId, deckId) => {
	for (let at = byId.get(deckId); at; at = byId.get(at.parent_id)) {
		if (at.tactic_ladder) return at.tactic_ladder;
	}
	return DEFAULT_TACTIC_LADDER;
}

// what progression needs to know of a set of cards, and its verdict on them.
// (The My flashcards list has only such counts, per deck, to go on.)
const cardStats = cards => ({
	total: cards.length,
	seen: cards.filter(isSeen).length,
	graduated: cards.filter(isGraduated).length
});

const NO_CARDS = { total: 0, seen: 0, graduated: 0 };
const addStats = (a, b) => ({ total: a.total + b.total, seen: a.seen + b.seen, graduated: a.graduated + b.graduated });

const statsPass = ({ total, seen, graduated }) => seen === total && graduated >= GRADUATED_SHARE * total;

// each deck's children in order, under null the decks at the top: those with
// no parent, and those whose parent is not in the list (the deck studied,
// loaded without the decks around it)
const childrenByParent = decks => {
	const ids = new Set(decks.map(deck => deck.id));
	const children = new Map();
	for (const deck of decks) {
		const parent = ids.has(deck.parent_id) ? deck.parent_id : null;
		if (!children.has(parent)) children.set(parent, []);
		children.get(parent).push(deck);
	}
	for (const siblings of children.values()) siblings.sort((a, b) => a.position - b.position);
	return children;
}

// The decks written out as an outline, in reading order: each deck followed
// by everything inside it. level is how deep it sits (0 at the top); number
// is its place under the top deck said the way the cards' numbers say it,
// "2.3" for the third deck in the second ("" for the top deck itself).
// Descending runs every level backwards, each deck still ahead of what is
// inside it; the numbers stay the ascending ones.
const deckOutline = (decks, descending = false) => {
	const children = childrenByParent(decks);
	const outline = [];
	const walk = (parent, level, prefix) => {
		const siblings = (children.get(parent) ?? []).map((deck, index) => ({ deck, place: index + 1 }));
		for (const { deck, place } of descending ? siblings.reverse() : siblings) {
			const number = level === 0 ? "" : `${prefix}${place}`;
			outline.push({ deck, level, number, holdsDecks: children.has(deck.id) });
			walk(deck.id, level + 1, number ? `${number}.` : "");
		}
	}
	walk(null, 0, "");
	return outline;
}

// where every deck falls in the reading order, for sorting cards into it
const readingOrder = decks => new Map(deckOutline(decks).map(({ deck }, index) => [deck.id, index]));

// cards in reading order: deck by deck as the outline reads, then by their
// place in their deck
const byReadingOrder = order => (a, b) => order.get(a.deck_id) - order.get(b.deck_id) || a.position - b.position;

// A deck said in full, where it stands alone and its name would not say which
// one it is: the names down to it, "Rook endgames › Lucena".
const deckTrail = (decks, deckId) => {
	const byId = new Map(decks.map(deck => [deck.id, deck]));
	const names = [];
	for (let deck = byId.get(deckId); deck; deck = byId.get(deck.parent_id)) names.unshift(deck.name);
	return names;
}

const deckPath = (decks, deckId) => deckTrail(decks, deckId).join(" › ");

// the ids of a deck and of everything inside it
const deckSubtree = (decks, deckId) => {
	const children = childrenByParent(decks);
	const inside = new Set();
	const collect = id => {
		inside.add(id);
		for (const child of children.get(id) ?? []) collect(child.id);
	}
	collect(deckId);
	return inside;
}

// the cards of a deck and of everything inside it
const cardsUnder = (decks, cards, deckId) => {
	const inside = deckSubtree(decks, deckId);
	return cards.filter(card => inside.has(card.deck_id));
}

// The decks as the choices of where cards go: the outline top to bottom, each
// name stepped in by its depth (with non-breaking spaces, which a <select>
// keeps). A bought deck's own cannot take cards.
const deckChoices = decks => deckOutline(decks).map(({ deck, level }) =>
	({ id: deck.id, label: "   ".repeat(level) + deck.name, disabled: !!deck.bought }));

// One walk of the tree in reading order, opening what progression allows.
// unlocked: the ids of the decks study may introduce new cards from (an empty
// deck passes and never holds the ones after it shut).
// firstLocked: the first shut deck in reading order and what holds it shut:
// the deck before it, or (own) the cards of the deck it sits in, which come
// first. null when nothing is shut.
// With a root, the walk is of that deck alone, studied on its own: it is open
// whatever stands before it — asking for it is the studier's say. Without,
// every deck at the top is open.
// It goes by each deck's own counts (stats: deck id -> cardStats of the cards
// in it), which is all it needs of the cards.
const walkProgression = (decks, stats, rootId = null) => {
	const children = childrenByParent(decks);
	const own = id => stats.get(id) ?? NO_CARDS;
	const under = id => (children.get(id) ?? []).reduce((sum, child) => addStats(sum, under(child.id)), own(id));

	const unlocked = new Set();
	let firstLocked = null;
	const open = deck => {
		unlocked.add(deck.id);
		const inside = children.get(deck.id) ?? [];
		if (!deck.in_order) {
			for (const child of inside) open(child);
			return;
		}
		if (inside.length && !statsPass(own(deck.id))) {
			firstLocked ??= { locked: inside[0], before: deck, own: true };
			return;
		}
		for (const [index, child] of inside.entries()) {
			open(child);
			if (!statsPass(under(child.id))) {
				const next = inside[index + 1];
				if (next) firstLocked ??= { locked: next, before: child, own: false };
				return;
			}
		}
	}
	const roots = rootId ? decks.filter(deck => deck.id === rootId) : children.get(null) ?? [];
	for (const root of roots) open(root);
	return { unlocked, firstLocked };
}

// each deck's own counts, from the cards themselves
const statsByDeck = cards => {
	const own = new Map();
	for (const card of cards) {
		if (!own.has(card.deck_id)) own.set(card.deck_id, []);
		own.get(card.deck_id).push(card);
	}
	return new Map([...own].map(([id, list]) => [id, cardStats(list)]));
}

const unlockedDeckIds = (decks, cards, rootId = null) =>
	walkProgression(decks, statsByDeck(cards), rootId).unlocked;

const firstLockedDeck = (decks, cards, rootId = null) =>
	walkProgression(decks, statsByDeck(cards), rootId).firstLocked;

// one from each list in turn, each list's own order kept
const takeTurns = lists => {
	const merged = [];
	for (let round = 0; merged.length < lists.reduce((sum, list) => sum + list.length, 0); round++) {
		for (const list of lists) if (round < list.length) merged.push(list[round]);
	}
	return merged;
}

// The order new cards come in, as a rank for each of `cards` (card id ->
// 0..n-1). A deck in order gives its own cards and then each deck inside it
// in turn; a mixed one takes one card from its own and from each deck inside
// in turn, each in its own order. Ranked once over the cards still new when a
// visit begins, the turns hold still while the cards ahead leave them.
const newCardRanks = (decks, cards) => {
	const children = childrenByParent(decks);
	const ownCards = new Map();
	for (const card of [...cards].sort((a, b) => a.position - b.position)) {
		if (!ownCards.has(card.deck_id)) ownCards.set(card.deck_id, []);
		ownCards.get(card.deck_id).push(card);
	}
	const sequence = deck => {
		const parts = [ownCards.get(deck.id) ?? [], ...(children.get(deck.id) ?? []).map(sequence)];
		return deck.in_order ? parts.flat() : takeTurns(parts);
	}
	const ranked = (children.get(null) ?? []).flatMap(sequence);
	return new Map(ranked.map((card, rank) => [card.id, rank]));
}

// The My flashcards list's rows: every deck in reading order, each with the
// counts of everything under it (the learning and review cards due, and
// every new card, in a deck progression still holds shut as much as in an
// open one — so a row is the sum of the rows under it; total, every card),
// whether progression has it locked, and whether it has decks inside to
// open onto.
// stats: deck id -> its own cardStats and its due counts, { new, learn,
// review }.
const deckListing = (decks, stats) => {
	const children = childrenByParent(decks);
	const sums = new Map();
	const sum = deck => {
		const own = stats.get(deck.id);
		const counts = { new: own?.new ?? 0, learn: own?.learn ?? 0, review: own?.review ?? 0, total: own?.total ?? 0 };
		for (const child of children.get(deck.id) ?? []) {
			const inside = sum(child);
			for (const key of Object.keys(counts)) counts[key] += inside[key];
		}
		sums.set(deck.id, counts);
		return counts;
	}
	for (const root of children.get(null) ?? []) sum(root);
	const open = walkProgression(decks, stats).unlocked;
	return deckOutline(decks).map(({ deck, level, holdsDecks }) =>
		({ deck, level, holdsDecks, locked: !open.has(deck.id), ...sums.get(deck.id) }));
}

// how far along a deck is toward passing, for the "unlocks at" note
const deckProgress = cards => ({
	seen: cards.filter(isSeen).length,
	graduated: cards.filter(isGraduated).length,
	graduatedNeeded: Math.ceil(GRADUATED_SHARE * cards.length),
	total: cards.length
});

export { GRADUATED_SHARE, DEFAULT_TACTIC_LADDER, tacticLadder, isSeen, isGraduated, cardStats, statsPass, childrenByParent, deckOutline, readingOrder, byReadingOrder, deckTrail, deckPath, deckSubtree, cardsUnder, deckChoices, unlockedDeckIds, firstLockedDeck, newCardRanks, deckListing, deckProgress }
