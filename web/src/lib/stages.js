// Stage progression, computed from card state alone: no stored unlock flag,
// so resetting a deck re-locks its later stages by itself.
//
// A stage passes when every card has been seen and at least
// GRADUATED_SHARE of them have graduated. Graduated means proved once —
// Review or Relearning, never Learning: a lapse (Review -> Relearning)
// cannot re-lock a stage already passed, and short of a reset no card
// returns to Learning or New. Stages unlock cumulatively: the first is
// always open, each next one opens when all before it pass.

const GRADUATED_SHARE = 0.8;

// a tactic card carries no FSRS state; its grades stamp last_review
// (seen) and finished_at (done for good, its graduation)
const isSeen = card => card.card_type === "tactic"
	? card.finished_at != null || card.last_review != null
	: card.state !== 0;

const isGraduated = card => card.card_type === "tactic"
	? card.finished_at != null
	: card.state === 2 || card.state === 3;

const stagePasses = cards =>
	cards.every(isSeen) && cards.filter(isGraduated).length >= GRADUATED_SHARE * cards.length;

// the ids of the stages study may introduce new cards from (an empty stage
// passes vacuously and never holds the ones after it shut)
const unlockedStageIds = (stages, cards) => {
	const sorted = [...stages].sort((a, b) => a.position - b.position);
	const unlocked = new Set();
	for (const stage of sorted) {
		unlocked.add(stage.id);
		if (!stagePasses(cards.filter(card => card.stage_id === stage.id))) break;
	}
	return unlocked;
}

// how far along a stage is toward passing, for the "unlocks at" note
const stageProgress = cards => ({
	seen: cards.filter(isSeen).length,
	graduated: cards.filter(isGraduated).length,
	graduatedNeeded: Math.ceil(GRADUATED_SHARE * cards.length),
	total: cards.length
});

export { GRADUATED_SHARE, isSeen, isGraduated, stagePasses, unlockedStageIds, stageProgress }
