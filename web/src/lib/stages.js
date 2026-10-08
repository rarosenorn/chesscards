// Stage progression, computed from card state alone: no stored unlock flag,
// so resetting a deck re-locks its later stages by itself.
//
// The stages of a deck form a tree: a stage's parent_id names the stage it
// sits inside (null at the deck's top level), and its position is its place
// among its siblings. A stage holds either cards or stages, never both, so
// the cards all sit at the leaves.
//
// A stage passes when every card under it has been seen and at least
// GRADUATED_SHARE of them have graduated. Graduated means proved once —
// Review or Relearning, never Learning: a lapse (Review -> Relearning)
// cannot re-lock a stage already passed, and short of a reset no card
// returns to Learning or New. Stages unlock cumulatively among their
// siblings: the first is always open, each next one opens when all before
// it pass. How many levels down that holds is the deck's progression depth;
// below it, everything inside an open stage is open at once.

const GRADUATED_SHARE = 0.8;

// Every stage has a name, so there are two ways to write one out (the
// user-facing word is "chapter"; "stage" stays the code's name).
//
// Numbered, for the running text of study's unlock note, where the name
// alone would not say how far along the chapter sits.
const stageLabel = stage => `Chapter ${stage.position} — ${stage.name}`;

// Bare, everywhere the chapters are shown as a list: the Cards table's bars
// and the pickers run in deck order, so the number only repeats the order
// the eye already reads.
const stageName = stage => stage.name;

// a tactic card carries no FSRS state; its grades stamp last_review
// (seen) and reps (its ladder rung). It graduates on its first climb —
// finishing the ladder takes over a year, too long to hold a chapter shut
const isSeen = card => card.card_type === "tactic"
	? card.finished_at != null || card.last_review != null
	: card.state !== 0;

const isGraduated = card => card.card_type === "tactic"
	? card.finished_at != null || (card.reps ?? 0) > 0
	: card.state === 2 || card.state === 3;

const stagePasses = cards =>
	cards.every(isSeen) && cards.filter(isGraduated).length >= GRADUATED_SHARE * cards.length;

// each stage's children in order, the deck's top level under null
const childrenByParent = stages => {
	const children = new Map();
	for (const stage of stages) {
		const parent = stage.parent_id ?? null;
		if (!children.has(parent)) children.set(parent, []);
		children.get(parent).push(stage);
	}
	for (const siblings of children.values()) siblings.sort((a, b) => a.position - b.position);
	return children;
}

// The deck's reading order: each stage followed by everything inside it.
// Where every stage falls in it, for sorting cards into deck order.
const stageOrder = stages => {
	const children = childrenByParent(stages);
	const order = new Map();
	const walk = parent => {
		for (const stage of children.get(parent) ?? []) {
			order.set(stage.id, order.size);
			walk(stage.id);
		}
	}
	walk(null);
	return order;
}

// the cards of a stage and of everything inside it
const cardsUnder = (stages, cards, stageId) => {
	const children = childrenByParent(stages);
	const inside = new Set();
	const collect = id => {
		inside.add(id);
		for (const child of children.get(id) ?? []) collect(child.id);
	}
	collect(stageId);
	return cards.filter(card => inside.has(card.stage_id));
}

// How deep a deck's progression runs, as the walk below takes it: 0 gates
// nothing, 1 the top-level stages, 2 theirs as well, Infinity every level
// there is (a deck that names no depth). A deck with chapters switched off
// shows none of them, so it gates nothing either — its stages may still be
// there, but nothing tells the studier so.
const gatingDepth = deck => deck.chapters ? deck.progressionDepth ?? Infinity : 0;

// One walk of the tree in reading order, opening what progression allows.
// unlocked: the ids of the stages study may introduce new cards from (an
// empty stage passes vacuously and never holds the ones after it shut).
// firstLocked: the first shut stage in reading order and the sibling before
// it that holds it shut, or null when nothing is shut.
const walkProgression = (stages, cards, depth) => {
	const children = childrenByParent(stages);
	const own = new Map();
	for (const card of cards) {
		if (!own.has(card.stage_id)) own.set(card.stage_id, []);
		own.get(card.stage_id).push(card);
	}
	const under = id =>
		(children.get(id) ?? []).reduce((all, child) => all.concat(under(child.id)), own.get(id) ?? []);

	const unlocked = new Set();
	let firstLocked = null;
	const open = (parent, level) => {
		const siblings = children.get(parent) ?? [];
		for (const [index, stage] of siblings.entries()) {
			unlocked.add(stage.id);
			open(stage.id, level + 1);
			if (level <= depth && !stagePasses(under(stage.id))) {
				const next = siblings[index + 1];
				if (next && !firstLocked) firstLocked = { locked: next, before: stage };
				break;
			}
		}
	}
	open(null, 1);
	return { unlocked, firstLocked };
}

const unlockedStageIds = (stages, cards, depth = Infinity) => walkProgression(stages, cards, depth).unlocked;

const firstLockedStage = (stages, cards, depth = Infinity) => walkProgression(stages, cards, depth).firstLocked;

// how far along a stage is toward passing, for the "unlocks at" note
const stageProgress = cards => ({
	seen: cards.filter(isSeen).length,
	graduated: cards.filter(isGraduated).length,
	graduatedNeeded: Math.ceil(GRADUATED_SHARE * cards.length),
	total: cards.length
});

export { GRADUATED_SHARE, stageLabel, stageName, isSeen, isGraduated, stagePasses, stageOrder, cardsUnder, gatingDepth, unlockedStageIds, firstLockedStage, stageProgress }
