// Subdeck progression, computed from card state alone: no stored unlock flag,
// so resetting a deck re-locks its later subdecks by itself.
//
// The subdecks of a deck form a tree: a subdeck's parent_id names the subdeck it
// sits inside (null at the deck's top level), and its position is its place
// among its siblings. A subdeck holds either cards or subdecks, never both, so
// the cards all sit at the leaves.
//
// A subdeck passes when every card under it has been seen and at least
// GRADUATED_SHARE of them have graduated. Graduated means proved once —
// Review or Relearning, never Learning: a lapse (Review -> Relearning)
// cannot re-lock a subdeck already passed, and short of a reset no card
// returns to Learning or New. Subdecks unlock cumulatively among their
// siblings: the first is always open, each next one opens when all before
// it pass. How many levels down that holds is the deck's progression depth;
// below it, everything inside an open subdeck is open at once.

const GRADUATED_SHARE = 0.8;

// A subdeck's name, everywhere the subdecks are shown as an outline: the
// Cards table's headers and the pickers run in deck order, so its place is
// what the eye already reads.
const subdeckName = subdeck => subdeck.name;

// a tactic card carries no FSRS state; its grades stamp last_review
// (seen) and reps (its ladder rung). It graduates on its first climb —
// finishing the ladder takes over a year, too long to hold a subdeck shut
const isSeen = card => card.card_type === "tactic"
	? card.finished_at != null || card.last_review != null
	: card.state !== 0;

const isGraduated = card => card.card_type === "tactic"
	? card.finished_at != null || (card.reps ?? 0) > 0
	: card.state === 2 || card.state === 3;

// what progression needs to know of a set of cards, and its verdict on them.
// (The My flashcards list has only such counts, per subdeck, to go on.)
const cardStats = cards => ({
	total: cards.length,
	seen: cards.filter(isSeen).length,
	graduated: cards.filter(isGraduated).length
});

const statsPass = ({ total, seen, graduated }) => seen === total && graduated >= GRADUATED_SHARE * total;

const subdeckPasses = cards => statsPass(cardStats(cards));

// each subdeck's children in order, the deck's top level under null
const childrenByParent = subdecks => {
	const children = new Map();
	for (const subdeck of subdecks) {
		const parent = subdeck.parent_id ?? null;
		if (!children.has(parent)) children.set(parent, []);
		children.get(parent).push(subdeck);
	}
	for (const siblings of children.values()) siblings.sort((a, b) => a.position - b.position);
	return children;
}

// The deck written out as an outline, in reading order: each subdeck followed
// by everything inside it. level is how deep it sits (1 = the deck's top
// level); number is its place said the way the cards' numbers say it, "2.3"
// for the third subdeck of the second; leaf is whether it holds cards (it has
// no subdecks inside). Descending runs every level backwards, each subdeck
// still ahead of what is inside it; the numbers stay the ascending ones.
const subdeckOutline = (subdecks, descending = false) => {
	const children = childrenByParent(subdecks);
	const outline = [];
	const walk = (parent, level, prefix) => {
		const siblings = (children.get(parent) ?? []).map((subdeck, index) => ({ subdeck, place: index + 1 }));
		for (const { subdeck, place } of descending ? siblings.reverse() : siblings) {
			const number = `${prefix}${place}`;
			outline.push({ subdeck, level, number, leaf: !children.has(subdeck.id) });
			walk(subdeck.id, level + 1, `${number}.`);
		}
	}
	walk(null, 1, "");
	return outline;
}

// A subdeck said in full, where it stands alone and its name would not say
// which one it is: the names down to it, "Rook endgames › Lucena".
const subdeckTrail = (subdecks, subdeckId) => {
	const byId = new Map(subdecks.map(subdeck => [subdeck.id, subdeck]));
	const names = [];
	for (let subdeck = byId.get(subdeckId); subdeck; subdeck = byId.get(subdeck.parent_id)) names.unshift(subdeck.name);
	return names;
}

const subdeckPath = (subdecks, subdeckId) => subdeckTrail(subdecks, subdeckId).join(" › ");

// how many levels of subdecks the deck has, for offering progression depths
const subdeckLevels = subdecks => Math.max(0, ...subdeckOutline(subdecks).map(entry => entry.level));

// where every subdeck falls in the reading order, for sorting cards into
// deck order
const subdeckOrder = subdecks =>
	new Map(subdeckOutline(subdecks).map(({ subdeck }, index) => [subdeck.id, index]));

// the subdecks that hold the cards, in reading order
const leafSubdecks = subdecks =>
	subdeckOutline(subdecks).filter(entry => entry.leaf).map(entry => entry.subdeck);

// The subdecks as the choices of where cards go: the outline top to bottom,
// each name stepped in by its depth (with non-breaking spaces, which a
// <select> keeps). Only the ones that hold cards can be chosen.
const subdeckChoices = subdecks => subdeckOutline(subdecks).map(({ subdeck, level, leaf }) =>
	({ id: subdeck.id, label: "\u00a0\u00a0\u00a0".repeat(level - 1) + subdeck.name, disabled: !leaf }));

// the ids of a subdeck and of everything inside it
const subdeckSubtree = (subdecks, subdeckId) => {
	const children = childrenByParent(subdecks);
	const inside = new Set();
	const collect = id => {
		inside.add(id);
		for (const child of children.get(id) ?? []) collect(child.id);
	}
	collect(subdeckId);
	return inside;
}

// the cards of a subdeck and of everything inside it
const cardsUnder = (subdecks, cards, subdeckId) => {
	const inside = subdeckSubtree(subdecks, subdeckId);
	return cards.filter(card => inside.has(card.subdeck_id));
}

// How deep a deck's progression runs, as the walk below takes it: 0 gates
// nothing, 1 the top-level subdecks, 2 theirs as well, Infinity every level
// there is (a deck that names no depth). A deck with subdecks switched off
// shows none of them, so it gates nothing either — its subdecks may still be
// there, but nothing tells the studier so.
const gatingDepth = deck => deck.usesSubdecks ? deck.progressionDepth ?? Infinity : 0;

// One walk of the tree in reading order, opening what progression allows.
// unlocked: the ids of the subdecks study may introduce new cards from (an
// empty subdeck passes vacuously and never holds the ones after it shut).
// firstLocked: the first shut subdeck in reading order and the sibling before
// it that holds it shut, or null when nothing is shut.
// With a root, the walk is of that subdeck alone, studied on its own: it is
// open whatever stands before it in the deck — asking for it is the
// studier's say — and progression holds among the subdecks inside it, at the
// levels they sit at in the deck.
// It goes by each subdeck's own counts (stats: subdeck id -> cardStats of the
// cards in it), which is all it needs of the cards.
const walkProgression = (subdecks, stats, depth, rootId = null) => {
	const children = childrenByParent(subdecks);
	const none = { total: 0, seen: 0, graduated: 0 };
	const under = id => (children.get(id) ?? []).reduce((sum, child) => {
		const inside = under(child.id);
		return { total: sum.total + inside.total, seen: sum.seen + inside.seen, graduated: sum.graduated + inside.graduated };
	}, stats.get(id) ?? none);

	const unlocked = new Set();
	let firstLocked = null;
	if (rootId) unlocked.add(rootId);
	const rootLevel = rootId ? subdeckOutline(subdecks).find(entry => entry.subdeck.id === rootId)?.level ?? 0 : 0;
	const open = (parent, level) => {
		const siblings = children.get(parent) ?? [];
		for (const [index, subdeck] of siblings.entries()) {
			unlocked.add(subdeck.id);
			open(subdeck.id, level + 1);
			if (level <= depth && !statsPass(under(subdeck.id))) {
				const next = siblings[index + 1];
				if (next && !firstLocked) firstLocked = { locked: next, before: subdeck };
				break;
			}
		}
	}
	open(rootId, rootLevel + 1);
	return { unlocked, firstLocked };
}

// each subdeck's own counts, from the cards themselves
const statsBySubdeck = cards => {
	const own = new Map();
	for (const card of cards) {
		if (!own.has(card.subdeck_id)) own.set(card.subdeck_id, []);
		own.get(card.subdeck_id).push(card);
	}
	return new Map([...own].map(([id, list]) => [id, cardStats(list)]));
}

const unlockedSubdeckIds = (subdecks, cards, depth = Infinity, rootId = null) =>
	walkProgression(subdecks, statsBySubdeck(cards), depth, rootId).unlocked;

const firstLockedSubdeck = (subdecks, cards, depth = Infinity, rootId = null) =>
	walkProgression(subdecks, statsBySubdeck(cards), depth, rootId).firstLocked;

// The My flashcards list's numbers for a deck and, when it uses subdecks, for
// each of them. A row's counts are what studying that row would put in front
// of you: the learning and review cards due under it, and the new ones in
// the subdecks progression leaves open — for the deck as a whole, or for a
// subdeck studied on its own (which is open itself, whatever the deck holds
// shut before it). A subdeck's row also says whether the deck has it locked,
// and whether it has subdecks of its own to open onto.
// stats: subdeck id -> its own cardStats and its due counts, { new, learn,
// review }.
const deckListing = ({ subdecks, usesSubdecks, progressionDepth }, stats) => {
	const depth = gatingDepth({ usesSubdecks, progressionDepth });
	const counts = (rootId = null) => {
		const open = walkProgression(subdecks, stats, depth, rootId).unlocked;
		const inside = rootId ? subdeckSubtree(subdecks, rootId) : null;
		const sum = { new: 0, learn: 0, review: 0 };
		for (const [id, own] of stats) {
			if (inside && !inside.has(id)) continue;
			sum.learn += own.learn;
			sum.review += own.review;
			if (open.has(id)) sum.new += own.new;
		}
		return sum;
	}
	const open = walkProgression(subdecks, stats, depth).unlocked;
	return {
		...counts(),
		subdecks: !usesSubdecks ? [] : subdeckOutline(subdecks).map(({ subdeck, level, leaf }) =>
			({ id: subdeck.id, name: subdeck.name, level, holdsSubdecks: !leaf, locked: !open.has(subdeck.id), ...counts(subdeck.id) }))
	};
}

// how far along a subdeck is toward passing, for the "unlocks at" note
const subdeckProgress = cards => ({
	seen: cards.filter(isSeen).length,
	graduated: cards.filter(isGraduated).length,
	graduatedNeeded: Math.ceil(GRADUATED_SHARE * cards.length),
	total: cards.length
});

export { GRADUATED_SHARE, subdeckName, subdeckTrail, subdeckPath, subdeckLevels, deckListing, isSeen, isGraduated, subdeckPasses, childrenByParent, subdeckOutline, subdeckOrder, leafSubdecks, subdeckChoices, subdeckSubtree, cardsUnder, gatingDepth, unlockedSubdeckIds, firstLockedSubdeck, subdeckProgress }
