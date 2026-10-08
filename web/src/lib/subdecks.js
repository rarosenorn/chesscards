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

// Every subdeck has a name, so there are two ways to write one out.
//
// Numbered, for the running text of study's unlock note, where the name
// alone would not say how far along the subdeck sits.
const subdeckLabel = subdeck => `Subdeck ${subdeck.position} — ${subdeck.name}`;

// Bare, everywhere the subdecks are shown as a list: the Cards table's bars
// and the pickers run in deck order, so the number only repeats the order
// the eye already reads.
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

const subdeckPasses = cards =>
	cards.every(isSeen) && cards.filter(isGraduated).length >= GRADUATED_SHARE * cards.length;

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
const walkProgression = (subdecks, cards, depth) => {
	const children = childrenByParent(subdecks);
	const own = new Map();
	for (const card of cards) {
		if (!own.has(card.subdeck_id)) own.set(card.subdeck_id, []);
		own.get(card.subdeck_id).push(card);
	}
	const under = id =>
		(children.get(id) ?? []).reduce((all, child) => all.concat(under(child.id)), own.get(id) ?? []);

	const unlocked = new Set();
	let firstLocked = null;
	const open = (parent, level) => {
		const siblings = children.get(parent) ?? [];
		for (const [index, subdeck] of siblings.entries()) {
			unlocked.add(subdeck.id);
			open(subdeck.id, level + 1);
			if (level <= depth && !subdeckPasses(under(subdeck.id))) {
				const next = siblings[index + 1];
				if (next && !firstLocked) firstLocked = { locked: next, before: subdeck };
				break;
			}
		}
	}
	open(null, 1);
	return { unlocked, firstLocked };
}

const unlockedSubdeckIds = (subdecks, cards, depth = Infinity) => walkProgression(subdecks, cards, depth).unlocked;

const firstLockedSubdeck = (subdecks, cards, depth = Infinity) => walkProgression(subdecks, cards, depth).firstLocked;

// how far along a subdeck is toward passing, for the "unlocks at" note
const subdeckProgress = cards => ({
	seen: cards.filter(isSeen).length,
	graduated: cards.filter(isGraduated).length,
	graduatedNeeded: Math.ceil(GRADUATED_SHARE * cards.length),
	total: cards.length
});

export { GRADUATED_SHARE, subdeckLabel, subdeckName, isSeen, isGraduated, subdeckPasses, childrenByParent, subdeckOutline, subdeckOrder, leafSubdecks, subdeckChoices, subdeckSubtree, cardsUnder, gatingDepth, unlockedSubdeckIds, firstLockedSubdeck, subdeckProgress }
