<script>
	import { alignByWrap } from "$lib/text-block-wrap.js"
	import { getContext, onMount, untrack } from "svelte"
	import { page } from "$app/state"
	import { enhance } from "$app/forms"
	import { fsrs, Rating, StrategyMode, GenSeedStrategyWithCardId } from "ts-fsrs"
	import { boardAlignment } from "$lib/side-alignment.js"
	import { ttGenerateHTML } from "$lib/tiptap-utility.js"
	import { countBoards, boardsBefore, firstBoardWithMoves, sideHasContent, countPuzzles } from "$lib/card-utils.js"
	import { DEFAULT_TACTIC_LADDER, isSeen, readingOrder, byReadingOrder, cardsUnder, unlockedDeckIds, firstLockedDeck, newCardRanks, deckProgress, deckTrail } from "$lib/deck-tree.js"
	import { isDueAt, isDueSoonAt, availableAt, dayStart, dayEnd, DAY_MS, DEFAULT_ROLLOVER_HOUR } from "$lib/rollover.js"
	import { DEFAULT_RETENTION } from "$lib/retention.js"
	import Chessboard from "$lib/components/Chessboard.svelte"
	import ArticleView from "$lib/components/ArticleView.svelte"
	import CardTypeSegments from "$lib/components/CardTypeSegments.svelte"
	import { parseMoveRef, markMoveRefs, moveRefLines } from "$lib/tiptap-move-ref.js"
	import PartyPopper from "$lib/icons/PartyPopper.svelte"
	import { confirmModal, modalState, settleModal } from "$lib/modals.svelte.js"
	import { PRACTICE_AGAIN_MS, startCram, answerCounts, backAt, takeNext, settle, forget, cardsLeft, resumeCram } from "$lib/cram.js"
	import { zen, zenActive, resetZen, setZen, peekAt } from "$lib/zen-state.svelte.js"
	import { updateCardStudyStateAndAddLog, markArticleRead, logPractice, completeCramSession, updateCardContent, updateCardType, deleteCards } from "$lib/cards.remote.js"

	// The deck studied, with every deck inside it (deck.decks, it first) and
	// all their cards: studying a deck studies everything under it. A card
	// says which deck it sits in by its deck_id.
	let deck = getContext("deck");
	// the FSRS model fitted to the user's own reviews, or null for the
	// defaults, and a refit under way, which takes over when it lands
	// (lib/server/fsrs-optimizer.js); the recall it schedules for, the user's
	// choice in Settings (lib/retention.js)
	let { fsrsParameters = null, refitted = null, desiredRetention = DEFAULT_RETENTION } = $props();
	const rolloverHour = getContext("rolloverHour") ?? (() => DEFAULT_ROLLOVER_HOUR);

	// a marketplace deck's cards can only be viewed, not edited: said of the
	// card in hand, since a deck of the user's own can hold a marketplace
	// deck they have taken
	let readonly = $derived(deck.isMarketplace || !!currentCard?.marketplace_deck_instance_id);

	// owners can edit the current card in place (like browse), via the Edit
	// button on the answer row or the e key
	let editingCard = $state(false);

	// The block editor drags tiptap's ProseMirror view, the chessboard editor
	// and svelte-dnd-action behind it — ~1.2 MB that studying never touches.
	// Loading it on the first edit keeps it off the path to the first card.
	let CardBlockEdit = $state(null);
	let editorModule = null;

	// The card's type is chosen on the row above the editor, as on the
	// add-cards page. It is held here rather than written on click: the
	// editor has a Cancel, and a type already saved would survive it.
	let editCardType = $state(null);

	const startEditing = async () => {
		editorModule ??= import("$lib/components/CardBlockEdit.svelte");
		CardBlockEdit = (await editorModule).default;
		editCardType = currentCard.card_type;
		editingCard = true;
	}
	const saveEdit = async (front, back) => {
		const card = currentCard;
		await updateCardContent({ cardId: card.id, front, back });
		card.front = JSON.parse(front);
		card.back = JSON.parse(back);
		// the type is saved with the rest, so cancelling leaves it alone. It
		// decides how the card is graded, so the queue re-derives from it.
		if (editCardType !== card.card_type) {
			Object.assign(card, await updateCardType({ cardId: card.id, cardType: editCardType }));
		}
		editingCard = false;
	}

	// the Delete key drops the card being studied, behind browse's confirmation
	// — the card and its progress go for good. Removing it from
	// deck.cards re-derives currentCard, so the next due card takes its place.
	const deleteCurrentCard = async () => {
		const { id } = currentCard;
		const confirmed = await confirmModal({
			title: "Delete card",
			message: "This permanently deletes the card and its progress.",
			confirmLabel: "Delete",
			danger: true
		});
		if (!confirmed) return;
		await deleteCards({ cardIds: [id] });
		deck.cards = deck.cards.filter(card => card.id !== id);
		isCardTurned = false;
		if (cram) {
			forget(cram, id);
			cramAdvance();
		}
	}

	// Fuzz, as Anki does it: a little randomness on each interval so cards
	// introduced together and graded alike stop arriving on the same day
	// forever — a deck added in one sitting would otherwise come back in one
	// sitting for good.
	// The seed is the card, not the clock: ts-fsrs's default seeds on the
	// review instant, which would fuzz the preview under the button and the
	// grade that follows it differently, and the button would be promising a
	// date the card does not get.
	// One scheduler per desired retention, each card scheduled for its own
	// deck's (lib/deck-tree.js desiredRetention, the deck above's or the
	// user's when it has none); built afresh when a refit's weights land.
	// svelte-ignore state_referenced_locally
	let weights = $state.raw(fsrsParameters);
	// svelte-ignore state_referenced_locally
	refitted?.then(w => { if (w) weights = w }, () => {});
	let schedulers = $derived.by(() => {
		const w = weights, built = new Map();
		return retention => {
			if (!built.has(retention)) {
				built.set(retention, fsrs({ ...(w ? { w } : {}), enable_fuzz: true, request_retention: retention })
					.useStrategy(StrategyMode.SEED, GenSeedStrategyWithCardId("id")));
			}
			return built.get(retention);
		};
	});
	const schedulerFor = card =>
		schedulers(deck.decks.find(entry => entry.id === card?.deck_id)?.desiredRetention ?? desiredRetention);

	// --- the queue ---
	// Learning cards come first, as they fall due; then due reviews, shuffled
	// once per visit (the keys live for the component, so grading doesn't
	// reshuffle what's left) — or, where the deck at the top says so, in the
	// order new cards come; then new cards, in the order the decks they sit
	// in give them (in order or mixed: newCardRanks). A tactic
	// has no FSRS state: unseen it queues as new, seen-but-unfinished it
	// queues with the reviews.
	const shuffleKeys = new Map();
	const shuffleKey = id => {
		if (!shuffleKeys.has(id)) shuffleKeys.set(id, Math.random());
		return shuffleKeys.get(id);
	}
	const isReviewState = card => card.card_type === "tactic"
		? isSeen(card)
		: card.state === 2 || card.state === 3;

	// the reading order: deck by deck as the outline reads, a deck's own
	// cards before those of the decks inside it
	let order = $derived(readingOrder(deck.decks));
	const byDeckOrder = (a, b) => byReadingOrder(order)(a, b);

	// The order new cards come in, ranked once over the cards still new, so
	// the turns a mixed deck gives its decks hold still while the cards ahead
	// leave them. Ranked again when the decks change (another deck, in order
	// or mixed switched, cards moved: each comes back as a fresh deck.decks),
	// or when cards turn up new that were not (a reset).
	let ranking = { decks: null, ranks: new Map() };
	const newRanks = newCards => {
		if (ranking.decks !== deck.decks || newCards.some(card => !ranking.ranks.has(card.id))) {
			ranking = { decks: deck.decks, ranks: newCardRanks(deck.decks, newCards) };
		}
		return ranking.ranks;
	}
	// the same order over every card, for reviews taken in order
	let reviewRanks = $derived(deck.reviewsInOrder ? newCardRanks(deck.decks, deck.cards) : null);

	// Progression gates only the introduction of unseen cards: anything
	// already met keeps its reviews coming even if its deck has fallen back
	// behind the bar (cards moved, decks regrouped). Each deck with decks
	// inside says whether they come in order or mixed; the deck studied is
	// open whatever stands before it where it sits — asking for it is the
	// studier's say.
	let studyCards = $derived(deck.cards);
	let unlockedDecks = $derived(unlockedDeckIds(deck.decks, deck.cards));
	const gated = card => !isSeen(card) && !unlockedDecks.has(card.deck_id);

	// The clock the queue is measured against. It ticks only while nothing is
	// on screen (see below), so a card that comes due mid-review can never
	// replace the one being looked at.
	let now = $state(Date.now());
	// still owed, whenever it falls due
	const isWaiting = card => !card.finished_at && !gated(card);
	// A day-scale card — an interval of a day or more, or a step that runs
	// past the next rollover — is read against the day boundary, not the
	// clock time it was graded at (see rollover.js) — so a card graded at 10pm
	// is waiting at 4am, the way Anki has it.
	const isDue = card => isWaiting(card) && isDueAt(card, now, rolloverHour());
	// Anki's learn-ahead limit. Without it the tail of a session dead-ends: the
	// last card is graded Again, comes back in a minute, and the page says
	// "finished for now" for a card that could be answered right now. Only the
	// short steps are ever within reach — everything on a real schedule is days
	// away — so this needs no test for which queue a card is in.
	const isDueSoon = card => isWaiting(card) && isDueSoonAt(card, now, rolloverHour());

	// Anki's three counts, on the same split the deck list uses (decks.js):
	// a card is new while it has never been graded, learning while it is
	// stepping through the short intervals, due once it is on a real
	// schedule. Gated and finished cards are not waiting, so they are not
	// counted, and an article is read, not studied, so it is in none of
	// them. The learning count reaches as far as learn-ahead does, as
	// Anki's: a step a few minutes off is this session's, and the card shown
	// early is never counted as none.
	const queueOf = card =>
		card.state === 1 || card.state === 3 ? "learn"
			: card.state === 0 || (card.state == null && card.last_review == null) ? "new"
			: "review";
	let counts = $derived.by(() => {
		const studied = studyCards.filter(card => card.card_type !== "article");
		const due = studied.filter(isDue);
		return {
			new: due.filter(card => queueOf(card) === "new").length,
			learn: studied.filter(card => queueOf(card) === "learn" && (isDue(card) || isDueSoon(card))).length,
			review: due.filter(card => queueOf(card) === "review").length
		};
	});

	const byDueTime = (min, card) => Date.parse(card.due) < Date.parse(min.due) ? card : min;

	let queuedCard = $derived.by(() => {
		const due = studyCards.filter(isDue);
		// Learning cards are time-critical, so they come first and in the order
		// they fell due — Anki fetches them the same way. This is what brings a
		// card graded Again back into the session a minute later instead of
		// leaving it to the end.
		const learning = due.filter(card => queueOf(card) === "learn");
		if (learning.length) return learning.reduce(byDueTime);
		const reviews = due.filter(isReviewState);
		if (reviews.length) {
			const key = reviewRanks ? card => reviewRanks.get(card.id) : card => shuffleKey(card.id);
			return reviews.reduce((min, card) => key(card) < key(min) ? card : min);
		}
		if (due.length) {
			const ranks = newRanks(studyCards.filter(card => !isSeen(card)));
			const rank = card => ranks.get(card.id) ?? Infinity;
			return due.sort((a, b) => rank(a) - rank(b) || byDeckOrder(a, b))[0];
		}
		// Nothing owed: reach ahead for the card the session would have waited
		// on, nearest first. Only ever from an empty queue, so a card fetched
		// early can never displace one that is genuinely due.
		const soon = studyCards.filter(isDueSoon);
		return soon.length ? soon.reduce(byDueTime) : undefined;
	});

	// What the layout keeps for this page while its other tabs are visited:
	// the card showing its answer (below), and a cram session under way.
	const studyState = getContext("studyState");

	// --- cram ---
	// Every card of what is being studied, due or not, gone through once in
	// an order chosen at the start (see lib/cram.js). The session belongs to
	// what it was started on: turn Study to another deck and it is over.
	let scopeKey = $derived(deck.id);
	let cram = $derived(studyState.cram?.scopeKey === scopeKey ? studyState.cram : null);

	// The session is also kept in this browser, under what it was started
	// on, so a break elsewhere on the site, or a reload, does not end it.
	// It lasts the study day (to the rollover hour, as due dates are read):
	// come back after the day has turned and it is gone, so yesterday's
	// cramming never stands in the way of today's reviews. A session being
	// studied as the day turns carries on into the new one: every answer
	// marks it as that day's, and one touched within the last hour is kept
	// whichever side of the hour that was.
	const CRAM_PREFIX = "chesscards:cram:";
	const CRAM_GRACE_MS = 60 * 60 * 1000;
	const sameStudyDay = at =>
		dayStart(at, rolloverHour()) === dayStart(Date.now(), rolloverHour()) || Date.now() - at < CRAM_GRACE_MS;
	const storedCram = key => {
		try {
			const saved = JSON.parse(localStorage.getItem(CRAM_PREFIX + key));
			if (!saved || !sameStudyDay(saved.savedAt)) return null;
			return resumeCram(saved, new Set(crammable(studyCards).map(card => card.id)));
		} catch {
			return null;
		}
	}
	// arriving at something to study (the page opening, Study turned to
	// another deck): its session is taken up again if it left one
	$effect(() => {
		const key = scopeKey;
		untrack(() => {
			if (studyState.cram?.scopeKey === key) return;
			const resumed = storedCram(key);
			studyState.cram = resumed && { ...resumed, scopeKey: key };
			if (!resumed) return;
			isCardTurned = false;
			advanceQueueClock();
			if (resumed.currentId == null) takeNext(studyState.cram, now);
		});
	});
	// ...and written down as it moves; a finished one is not kept
	$effect(() => {
		if (!cram) return;
		try {
			if (cardsLeft(cram) === 0) localStorage.removeItem(CRAM_PREFIX + cram.scopeKey);
			else localStorage.setItem(CRAM_PREFIX + cram.scopeKey, JSON.stringify({ ...cram, savedAt: Date.now() }));
		} catch {}
	});
	// sessions of earlier days, left under things not visited since, are
	// cleared out whenever Study opens
	onMount(() => {
		try {
			for (const key of Object.keys(localStorage)) {
				if (!key.startsWith(CRAM_PREFIX)) continue;
				let fresh = false;
				try { fresh = sameStudyDay(JSON.parse(localStorage.getItem(key)).savedAt); } catch {}
				if (!fresh) localStorage.removeItem(key);
			}
		} catch {}
	});

	let currentCard = $derived(cram ? deck.cards.find(card => card.id === cram.currentId) : queuedCard);
	// Whether the answer to the card on screen is a review like any other
	// (the usual buttons, saved and scheduled from) or practice (Again / Got
	// it, nothing saved). Read against the queue's clock, which stands still
	// while a card is up.
	let cramCounts = $derived(!!cram?.counts && currentCard != null && answerCounts(currentCard, now, rolloverHour()));

	// the choices a session starts from, as last made in this browser
	const CRAM_KEY = "chesscards:cram-options";
	const CRAM_ORDERS = [
		{ value: "in-order", label: "In order" },
		{ value: "shuffled", label: "Shuffled" },
		{ value: "due", label: "By due date" }
	];
	let cramChoice = $state({ order: "in-order", counts: true });
	const chooseCram = async () => {
		try {
			const last = JSON.parse(localStorage.getItem(CRAM_KEY) ?? "{}");
			if (CRAM_ORDERS.some(option => option.value === last.order)) cramChoice.order = last.order;
			if (typeof last.counts === "boolean") cramChoice.counts = last.counts;
		} catch {}
		const start = await confirmModal({
			title: "Cram",
			message: "Go through every card here once, whether it is due or not.",
			body: cramOptions,
			confirmLabel: "Start"
		});
		if (!start) return;
		try { localStorage.setItem(CRAM_KEY, JSON.stringify(cramChoice)); } catch {}
		beginCram(cramChoice);
	}
	// an article is read once, not crammed: it is read again in the Cards tab
	const crammable = cards => cards.filter(card => card.card_type !== "article");
	const beginCram = ({ order, counts }) => {
		studyState.cram = { scopeKey, ...startCram(crammable(studyCards).sort(byDeckOrder), { order, counts }) };
		cramAdvance();
	}
	// The next card of the session, read against a fresh clock. With none
	// left the session is one more gone through: it is noted on the account,
	// which answers with how many that makes here today, for the end screen.
	const cramAdvance = async () => {
		isCardTurned = false;
		advanceQueueClock();
		const session = studyState.cram;
		if (takeNext(session, now) != null) return;
		session.completed = await completeCramSession({ studiedId: deck.id });
	}
	const endCram = () => {
		try { localStorage.removeItem(CRAM_PREFIX + scopeKey); } catch {}
		studyState.cram = null;
		isCardTurned = false;
		advanceQueueClock();
	}
	// A practice answer: Again brings the card back in a minute, and the
	// card is left exactly as it was. The answer is noted only as study done
	// that day, for the activity heatmap.
	const cramPractice = async gotIt => {
		const card = currentCard;
		studyState.played = null;
		settle(cram, gotIt ? null : Date.now() + PRACTICE_AGAIN_MS);
		cramAdvance();
		await logPractice({ cardId: card.id, instance: !!card.marketplace_deck_instance_id, gotIt });
	}

	// A revealed answer belongs to the deck layout, not to this page, so
	// switching tabs and coming back does not hide it again — you have seen
	// it, and the grade should say so. Read once for the initial value, then
	// mirrored back on every change; the id keeps it from carrying over to
	// whichever card comes next.
	// svelte-ignore state_referenced_locally
	let isCardTurned = $state(currentCard != null && studyState.turnedCardId === currentCard.id);
	$effect(() => { studyState.turnedCardId = isCardTurned ? currentCard?.id ?? null : null; });
	// A revealed answer is that card's alone: when another card takes its
	// place by some other way than a grade (the breadcrumb turning Study to
	// another deck), it comes front up.
	// svelte-ignore state_referenced_locally
	let shownCardId = currentCard?.id;
	$effect(() => {
		const id = currentCard?.id;
		if (id === shownCardId) return;
		shownCardId = id;
		isCardTurned = false;
	});

	// --- articles ---
	// An article (a first exposure article) is a page read once, before the
	// cards after it. It waits among the new cards where it sits, and when
	// it comes up it is the page, with a Continue button that finishes it
	// for good: on the account, so it does not come up again on any device.
	// It is read again in the Cards tab, not here.
	let isArticle = $derived(currentCard?.card_type === "article");
	// over its title, the decks it sits inside; the deck it is in is the title
	let articleCrumbs = $derived(isArticle
		? [...(deck.ancestors ?? []).map(at => at.name), ...deckTrail(deck.decks, currentCard.deck_id)].map(name => ({ name }))
		: []);
	const readArticle = async () => {
		const card = currentCard;
		const at = new Date().toISOString();
		advanceQueueClock();
		deck.cards[deck.cards.indexOf(card)] = { ...card, last_review: at, finished_at: at, due: at };
		window.scrollTo(0, 0);
		await markArticleRead({ cardId: card.id, instance: !!card.marketplace_deck_instance_id });
	}

	let isTactic = $derived(currentCard?.card_type === "tactic");
	// which of the three the card on screen came out of
	let currentQueue = $derived(currentCard ? queueOf(currentCard) : null);

	// The clock the due-time previews are measured from. It has to be taken
	// when the answer is revealed, not when this component runs: `new Date()`
	// is a plain value, so a page left open for a quarter of an hour would
	// otherwise offer "1 minute from fifteen minutes ago" — a negative label
	// under Again. The previews are only on screen while turned, so revealing
	// is the one moment that needs a fresh reading.
	let previewAt = $state(Date.now());
	const showAnswer = () => {
		previewAt = Date.now();
		if (selfGrading && studyState.played?.cardId !== currentCard.id)
			studyState.played = { cardId: currentCard.id, correct: cleanBoards.size >= frontPuzzles };
		isCardTurned = true;
	}

	// Boards marked as puzzles are played on the front; the card turns by
	// itself once every one of them has been played through.
	let frontPuzzles = $derived(countPuzzles(currentCard?.front));
	let solvedBoards = new Set();
	let cleanBoards = new Set();
	// a new card, or this one turned back over, starts its puzzles afresh
	$effect(() => { void currentCard?.id; if (!isCardTurned) { solvedBoards = new Set(); cleanBoards = new Set(); } });
	const boardSolved = (n, clean) => {
		solvedBoards.add(n);
		if (clean) cleanBoards.add(n);
		if (!isCardTurned && solvedBoards.size >= frontPuzzles) showAnswer();
	}
	// A tactic played on the board grades itself, as a puzzle on Lichess
	// does: right if every puzzle on its front was played through with no
	// wrong move, wrong if one went astray or Show gave the answer first.
	// Settled the first time the card turns, so a replay after Hide does not
	// change it, and kept beside the turned card in the layout, so a tab
	// switch does not lose it. A grade clears it.
	let selfGrading = $derived(isTactic && frontPuzzles > 0);
	let played = $derived(studyState.played?.cardId === currentCard?.id ? studyState.played : null);

	let preview = $derived(isTactic ? null : schedulerFor(currentCard).repeat(currentCard, new Date(previewAt)));

	let frontBoardCount = $derived(currentCard ? countBoards(currentCard.front) : 0);
	// where the arrows land: the card's first board that has moves to step
	let focusBoardNumber = $derived(
		currentCard ? firstBoardWithMoves(currentCard.front, currentCard.back) : null
	);
	// how many boards the whole card holds, front and back
	let cardBoardCount = $derived(
		currentCard ? frontBoardCount + countBoards(currentCard.back) : 0
	);
	// board numbers are only shown when the card has several boards to reference
	// numbered once more than one board is on show: the back's boards count
	// only when the card is turned, so a lone front board is not "1" to
	// boards nobody can see yet
	let showBoardNumbers = $derived((isCardTurned ? cardBoardCount : frontBoardCount) > 1);

	// A move written in the card's text drives the board it names (see
	// tiptap-move-ref.js): the click is handed to that board by number, and
	// the nonce makes a second click on the same move a second request. One
	// store for the whole card, front and back alike; the next card starts
	// with nothing followed.
	let asides = $state({});
	let clicks = 0;
	$effect(() => { void currentCard; if (!isCardTurned) asides = {} });
	// ...and each board answers with where it now stands, so the move it is
	// showing is marked in the text that named it — an aside is nowhere else
	let boardAt = $state({});
	let cardElement = $state();
	$effect(() => { void currentCard; void isCardTurned; markMoveRefs(cardElement, boardAt) });
	const handleTextClick = e => {
		const token = e.target.closest?.("[data-move-ref]");
		if (!token) return;
		const ref = parseMoveRef(token);
		if (ref) asides[ref.board] = { ...ref, nonce: ++clicks };
	}

	// Grading is the one moment the queue may move under you: the card on
	// screen is leaving anyway. Reading the clock here is what lets a learning
	// step that has elapsed come back now rather than at the end of the
	// session — the timer below only runs while nothing is up.
	const advanceQueueClock = () => { now = Date.now() };
	const evaluateCard = async rating => {
		// held before the clock moves: advancing it re-derives currentCard,
		// which can already be the next card by the time it is written back
		const card = currentCard;
		const cardAndLog =
			schedulerFor(card).next(card, new Date(), rating);
		isCardTurned = false;
		advanceQueueClock();
		deck.cards[deck.cards.indexOf(card)] = cardAndLog.card;
		if (cram) {
			settle(cram, backAt(cardAndLog.card, rating === Rating.Again));
			cramAdvance();
		}
		await updateCardStudyStateAndAddLog(cardAndLog);
	}

	// Tactic cards climb a fixed ladder, not FSRS: a puzzle is solved afresh
	// each time rather than recalled, so it is exposure that is scheduled.
	// Correct waits the rung's interval and climbs (reps is the rung); past the
	// last rung the card is finished for good. Incorrect re-queues it a day
	// later (a post-fail success can't come from short-term memory) and starts
	// the ladder over. The ladder is the card's deck's (lib/deck-tree.js).
	let ladder = $derived(deck.decks.find(entry => entry.id === currentCard?.deck_id)?.ladder ?? DEFAULT_TACTIC_LADDER);
	// what Correct does to the card on screen, as the label over the button
	let tacticCorrectLabel = $derived.by(() => {
		const days = ladder[currentCard?.reps ?? 0];
		return days == null ? "Done" : days >= 365 ? +(days / 365).toFixed(1) + "y" : days + "d";
	});
	// how far up the card on screen has climbed, for the steps drawn beside
	// the buttons
	let tacticRung = $derived(Math.min(currentCard?.reps ?? 0, ladder.length));
	// Next grades a played tactic as the board found it; over it stands the
	// wait that grade gives, as over the buttons it replaces
	const gradePlayed = () => cram && !cramCounts ? cramPractice(played.correct) : evaluateTactic(played.correct);
	let playedLabel = $derived(
		!played ? "" : cram && !cramCounts ? (played.correct ? " " : "1m") : played.correct ? tacticCorrectLabel : "1d"
	);
	const evaluateTactic = async correct => {
		// shadows the queue's clock, which is advanced below like evaluateCard's
		const now = new Date();
		const rung = currentCard.reps ?? 0;
		studyState.played = null;
		const finished = correct && rung >= ladder.length;
		const waitDays = !correct ? 1 : finished ? 0 : ladder[rung];
		const card = {
			...currentCard,
			due: new Date(now.getTime() + waitDays * DAY_MS).toISOString(),
			reps: correct ? rung + 1 : 0,
			finished_at: finished ? now.toISOString() : null,
			// the tactic's "seen" mark: with no FSRS state, last_review is what
			// tells an attempted card from an untouched one (deck progression
			// reads it)
			last_review: now.toISOString()
		};
		const log = {
			rating: correct ? Rating.Good : Rating.Again,
			state: null, due: finished ? null : card.due, stability: null,
			difficulty: null, elapsed_days: null, last_elapsed_days: null,
			scheduled_days: null, learning_steps: null, review: now.toISOString()
		};
		isCardTurned = false;
		deck.cards[deck.cards.indexOf(currentCard)] = card;
		advanceQueueClock();
		// missed, it is due tomorrow: within the session it comes back as
		// practice, the way Again does
		if (cram) {
			settle(cram, correct ? null : Date.now() + PRACTICE_AGAIN_MS);
			cramAdvance();
		}
		await updateCardStudyStateAndAddLog({ card, log });
	}

	// `from` is the clock the interval is measured against. The grade previews
	// pass previewAt — the instant they were computed from — so "1m" under
	// Again stays 1m however long the answer sits on screen; measuring them
	// against the current time counts that reading time down and goes
	// negative. Grading itself starts a fresh clock, so previewAt is also the
	// promise it keeps.
	const formatTimeUntil = (dueDate, from = Date.now()) => {
		const minutes = (Date.parse(dueDate) - from) / 1000 / 60;
		// a step past the next rollover waits for that day's start (rollover.js)
		if (minutes / 60 < 24 && Date.parse(dueDate) >= dayEnd(from, rolloverHour()))
			return "1d";
		if (minutes < 60)
			return Math.round(minutes * 10) / 10 + "m";
		if (minutes / 60 < 24)
			return Math.round(minutes / 60 * 10) / 10 + "h";
		if (minutes / 60 / 24 < 365) {
			return Math.floor(minutes / 60 / 24) + "d";
		}
		return minutes / 60 / 24 / 365 + "y";
	}

	const getTimeUntilDuePreviewText = rating =>
		formatTimeUntil(preview[rating].card.due, previewAt);

	// The wait, as the rest of "Next review: ...". Below a day it is a duration
	// counted to the minute; past that a card is waiting at a day boundary, so
	// it is a day on the calendar instead — "tomorrow", never "in 26 hours".
	const formatNextReview = dueDate => {
		const withUnit = (value, unit) => `${value} ${unit}${value === 1 ? "" : "s"}`;
		const hour = rolloverHour();
		const due = Date.parse(dueDate);
		const now = Date.now();
		const days = Math.round((dayStart(due, hour) - dayStart(now, hour)) / DAY_MS);
		if (days === 1)
			return "tomorrow";
		if (days >= 365)
			return `in ${withUnit(Math.round(days / 365 * 10) / 10, "year")}`;
		if (days > 1)
			return `in ${withUnit(days, "day")}`;
		const minutes = (due - now) / 1000 / 60;
		if (minutes < 1)
			return "in less than a minute";
		// round the whole wait, then split it, so 119.7 minutes is not "1 hour 60 minutes"
		const total = Math.round(minutes);
		if (total < 60)
			return `in ${withUnit(total, "minute")}`;
		const hours = Math.floor(total / 60);
		const rest = total % 60;
		return rest
			? `in ${withUnit(hours, "hour")} ${withUnit(rest, "minute")}`
			: `in ${withUnit(hours, "hour")}`;
	}

	// earliest upcoming due among the deck's unfinished, ungated cards (null
	// when empty or all finished); only meaningful when no card is currently
	// due — a locked deck's cards have no date to promise, its unlock note
	// below speaks for them
	let nextDue = $derived.by(() => {
		const unfinished = studyCards.filter(card => !card.finished_at && !gated(card));
		// the card that arrives first, by when it ACTUALLY arrives: a day-scale
		// card is waiting at its day's boundary, not at the hour it was graded
		return unfinished.length
			? new Date(Math.min(...unfinished.map(card => availableAt(card, rolloverHour())))).toISOString()
			: null;
	});

	// nothing to study because nothing is there, which is not being done
	let emptyNote = $derived(studyCards.length > 0 ? null : "This deck has no cards yet.");

	// When the queue runs dry against a locked deck, say what unlocks it: the
	// first locked deck and how far what holds it shut has to go — the deck
	// before it, with everything inside it, or the cards of the deck it sits
	// in, which come first. A deck is said by the names down to it from the
	// deck studied.
	let lockedNote = $derived.by(() => {
		const first = firstLockedDeck(deck.decks, deck.cards);
		if (!first) return null;
		const name = id => {
			const trail = deckTrail(deck.decks, id);
			return (trail.length > 1 ? trail.slice(1) : trail).join(" › ");
		};
		return {
			locked: name(first.locked.id),
			before: first.own ? `the cards of ${name(first.before.id)}` : name(first.before.id),
			progress: deckProgress(first.own
				? deck.cards.filter(card => card.deck_id === first.before.id)
				: cardsUnder(deck.decks, deck.cards, first.before.id))
		};
	});

	// Zen mode: the page's two bars step aside while a card is up (the store
	// carries it to the layouts that own them; the counters and Edit stay).
	// It is the study page that holds the mode — mounted here, dropped on the
	// way out — and it is not remembered between visits: each arrival starts
	// with the chrome up and z is what takes it away, unless the deck was
	// chosen from the switcher in zen. Known by its address: the layout puts
	// the new deck in context only after this page has mounted.
	onMount(() => {
		resetZen(`/my-flashcards/${page.params.id}/study`);
		return () => { zen.studying = false; zen.peeking = false };
	});
	// On the "finished for now" screen the next card is often minutes away (the
	// learning steps are 1m and 10m), so the clock ticks there and the card
	// arrives on its own. It stops the moment one does — a queue that
	// re-derives under a card being studied would swap it out mid-thought.
	$effect(() => {
		if (currentCard) return;
		const id = setInterval(() => now = Date.now(), 30_000);
		return () => clearInterval(id);
	});

	// zen holds only while a card is up: the deck's "finished for now" screen
	// is the end of the session, and the page's chrome belongs back on it.
	// The mode itself stays on, so the next card enters zen again.
	$effect(() => {
		zen.studying = currentCard != null && !isArticle;
		if (!currentCard) zen.peeking = false;
	});

	// the bars peek back in at the top edge (zen-state.svelte.js)
	const handleMouseMove = e => peekAt(e.clientY);

	const handleKeyDown = e => {
		// while editing, the card editor owns the keyboard (Ctrl+Enter saves),
		// and a modal owns it while it is up
		if (editingCard || modalState.current) return;
		// an article is up: Enter is its Continue button, unless it is
		// pressing a button or link of the page's own; it takes no other keys.
		// A held Enter repeats, and would read the next article unseen.
		if (isArticle) {
			if (e.key === "Enter" && !e.repeat && !e.target.closest?.("button, a")) {
				e.preventDefault();
				readArticle();
			}
			return;
		}
		const typing = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA"
			|| e.target.isContentEditable;
		if (e.key === "z" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing) {
			e.preventDefault();
			setZen(!zen.on);
			return;
		}
		// Escape always leaves, whatever put you here — unless a modal is up,
		// where Escape is the modal's cancel and nothing else's, or the deck
		// switcher's choice is open, which it closes (DeckNavBar)
		if (e.key === "Escape" && zen.on && !modalState.current && !zen.choosing && !e.defaultPrevented) {
			e.preventDefault();
			setZen(false);
			return;
		}
		if (
			e.key === "e" && !e.ctrlKey && !e.metaKey && !e.altKey &&
			!readonly && currentCard &&
			e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA" &&
			!e.target.isContentEditable
		) {
			e.preventDefault();
			startEditing();
			return;
		}
		if (
			e.key === "Delete" && !readonly && currentCard &&
			e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA" &&
			!e.target.isContentEditable
		) {
			e.preventDefault();
			deleteCurrentCard();
			return;
		}
		if (!isCardTurned) {
			if (e.key === " ") {
				e.preventDefault();
				showAnswer();
			}
		} else if (e.key === "h" || e.key === "H") {
			isCardTurned = false;
		} else if (played) {
			if (e.key === " ") {
				e.preventDefault();
				gradePlayed();
			}
		} else if (cram && !cramCounts) {
			switch (e.key) {
				case "1": cramPractice(false); break;
				case " ":
				case "2":
					e.preventDefault();
					cramPractice(true);
					break;
			}
		} else if (isTactic) {
			switch (e.key) {
				case "1": evaluateTactic(false); break;
				case " ":
				case "2":
					e.preventDefault();
					evaluateTactic(true);
					break;
			}
		} else {
			switch (e.key) {
				case "1": evaluateCard(Rating.Again); break;
				case "2": evaluateCard(Rating.Hard); break;
				case " ":
				case "3":
					e.preventDefault();
					evaluateCard(Rating.Good);
					break;
				case "4": evaluateCard(Rating.Easy); break;
			}
		}
	}

</script>
<svelte:window onkeydown={handleKeyDown} onmousemove={handleMouseMove} />

{#snippet side(side, boardNumberOffset, revealed, marksBack = false, onBack = false)}
<div
	class="card-side"
	data-board-align={boardAlignment(side)}
>
	{#each side as block, blockIndex}
		{#if block.type === "text"}
			<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -- the moves inside are pointer targets; the board's own move line is the keyboard's way through a line -->
			<div class="text-block" onclick={handleTextClick} {@attach alignByWrap}>
				{@html ttGenerateHTML(block.content)}
			</div>
		{:else if block.type === "chessboards"}
			<div
				class={{
					"single-board-block": block.content.length < 2,
						"board-grid-block": block.content.length > 1
				}}
			>
				{#each block.content as chessboard, boardIndex}
					<!-- the board's number is what the text calls it by, whether
					     or not the card is showing numbers -->
					{@const n = boardNumberOffset + boardsBefore(side, blockIndex) + boardIndex + 1}
					<div class="board-container">
						<!-- low floor: two squeezed boards must shrink, not overflow
					     their cells and crush the gap between them -->
					<!-- the "Back:" marker rides on the reveal: it names the moves
					     the question was hiding, so before the reveal there is
					     nothing to name (and it would spell out the answer);
					     back-side boards hide nothing, so they never mark, as
					     in browse -->
					<Chessboard
						board={chessboard}
						{revealed}
						{onBack}
						analysis
						backDots={false}
						authorView={marksBack}
						minWidth="280px"
						number={showBoardNumbers ? n : null}
						autoFocus={n - 1 === focusBoardNumber}
						aside={asides[n]}
						onPosition={at => boardAt[n] = at}
						lines={() => moveRefLines(cardElement, n)}
						onSolved={clean => boardSolved(n, clean)}
					/>
					</div>
				{/each}
			</div>
		{/if}
	{/each}
</div>
{/snippet}

{#if isArticle}
	<!-- each article a page of its own: a Continue that had the focus goes
	     with its page, and a held Enter does not read the next one -->
	{#key currentCard.id}
	<ArticleView crumbs={articleCrumbs} blocks={currentCard.front}>
		<div class="article-continue">
			<!-- the second click of a double click would land on the next
			     article's Continue, standing where this one did -->
			<button class="std-btn" onclick={e => e.detail < 2 && readArticle()}>Continue</button>
		</div>
	</ArticleView>
	{/key}
{:else if currentCard && editingCard && CardBlockEdit}
	<!-- the add-cards type row, above the card and on the page's own ground -->
	<div class="edit-type-row">
		<span id="edit-card-type-label">Type</span>
		<CardTypeSegments value={editCardType} onchoose={type => editCardType = type} labelledby="edit-card-type-label" />
	</div>
	<div class="flashcard-edit">
		<CardBlockEdit card={currentCard} article={editCardType === "article"} onSave={saveEdit} onCancel={() => editingCard = false} />
	</div>
{:else if currentCard}
	<div
		class="flashcard card-surface"
		class:zen={zenActive()}
		bind:this={cardElement}
	>
		<!-- turning reveals front boards' back layers (moves/annotations) in
		     place, on top of showing the back side below -->
		{@render side(currentCard.front, 0, isCardTurned, isCardTurned)}
		{#if isCardTurned}
			{#if sideHasContent(currentCard.back)}
				<div class="side-gap"></div>
			{/if}
			{@render side(currentCard.back, frontBoardCount, true, false, true)}
		{/if}
		<div class="card-actions">
		<!-- Anki's counts, in Anki's colours: what is still waiting in this
		     deck, kept out of the centred button row's way -->
		<!-- Written without whitespace between the spans: a newline here is a
		     space in the rendered line, and the gap is the plus's own margin.
		     The hair spaces inside each count are what widen its underline —
		     chrome draws the rule across the text, so padding cannot. -->
		{#if isTactic}
			<!-- the puzzle's ladder, in the corner the counts leave free: a step
			     for each wait, filled as far as the card has climbed -->
			<span class="ladder" role="img" aria-label="Climbed {tacticRung} of {ladder.length} steps">
				{#each ladder as _, step}
					<span class="step" class:climbed={step < tacticRung} style:height="{5 + step * 3}px"></span>
				{/each}
			</span>
		{/if}
		{#if cram}
			<!-- the card on screen as "card y of x": one more than the cards
			     done with, so the first is 1 and the last is x -->
			<p class="deck-counts cram">Cram session: <span class="review">{cram.total - cardsLeft(cram) + 1}</span>/{cram.total}</p>
		{:else}
		<p class="deck-counts"><span class="count new" class:current={currentQueue === "new"}><span class="hair">{"\u200a"}</span>{counts.new}<span class="hair">{"\u200a"}</span></span><span class="plus">+</span><span class="count learn" class:current={currentQueue === "learn"}><span class="hair">{"\u200a"}</span>{counts.learn}<span class="hair">{"\u200a"}</span></span><span class="plus">+</span><span class="count review" class:current={currentQueue === "review"}><span class="hair">{"\u200a"}</span>{counts.review}<span class="hair">{"\u200a"}</span></span></p>
		{/if}
		<div class="flashcard-btn-row">
			{#if !isCardTurned}
				<!-- carried in the same shape as a grade button, label and all,
				     so the row is the height it will be after the reveal: the
				     card must not resize under the pointer when the answer
				     comes in. The label is a spacer, hence aria-hidden. -->
				<div class="eval-btn">
					<p aria-hidden="true">&nbsp;</p>
					<button
						class="std-btn"
						onclick={showAnswer}
						title="Shortcut key: Space"
					>
						Show
					</button>
				</div>
			{:else}
					{#snippet evalBtn(text, rating, title)}
						<div class="eval-btn">
							<p>{getTimeUntilDuePreviewText(rating)}</p>
							<button
								onclick={() => evaluateCard(rating)}
								class="std-btn"
								title={"Shortcut key: " + title}
							>
								{text}
							</button>
						</div>
					{/snippet}
					{#if played}
						<div class="eval-btn">
							<p>{playedLabel}</p>
							<button
								onclick={gradePlayed}
								class="std-btn"
								title="Shortcut key: Space"
							>
								Next
							</button>
						</div>
					{:else if cram && !cramCounts}
						<!-- practice: the card is not scheduled from it, so there is only right
						     and not yet -->
						<div class="eval-btn">
							<p>1m</p>
							<button
								onclick={() => cramPractice(false)}
								class="std-btn"
								title="Shortcut key: 1"
							>
								Again
							</button>
						</div>
						<div class="eval-btn">
							<p aria-hidden="true">&nbsp;</p>
							<button
								onclick={() => cramPractice(true)}
								class="std-btn"
								title="Shortcut key: Space or 2"
							>
								Ok
							</button>
						</div>
					{:else if isTactic}
						<div class="eval-btn">
							<p>1d</p>
							<button
								onclick={() => evaluateTactic(false)}
								class="std-btn"
								title="Shortcut key: 1"
							>
								Incorrect
							</button>
						</div>
						<div class="eval-btn">
							<p>{tacticCorrectLabel}</p>
							<button
								onclick={() => evaluateTactic(true)}
								class="std-btn"
								title="Shortcut key: Space or 2"
							>
								Correct
							</button>
						</div>
					{:else}
						{@render evalBtn("Again", Rating.Again, "1")}
						{@render evalBtn("Hard", Rating.Hard, "2")}
						{@render evalBtn("Good", Rating.Good, "Space or 3")}
						{@render evalBtn("Easy", Rating.Easy, "4")}
					{/if}
			{/if}
		</div>
		{#if isCardTurned}
			<div class="side-actions">
				<button
					class="std-btn"
					onclick={() => isCardTurned = false}
					title="Shortcut key: h"
				>
					Hide
				</button>
				{#if !readonly}
					<button
						class="std-btn"
						onclick={startEditing}
						title="Shortcut key: e"
					>
						Edit
					</button>
				{/if}
			</div>
		{/if}
		</div>
	</div>
{:else}
	<div class="deck-done" class:zen={zenActive()}>
		{#if cram}
			<!-- going again asks for the order and the rest afresh, as starting
			     the first one did -->
			<p>Cram sessions completed today: {cram.completed ?? ""}</p>
			<button class="std-btn again-btn" onclick={chooseCram}>Go again?</button>
		{:else if emptyNote}
			<p>{emptyNote}</p>
		{:else if lockedNote}
			<p>All caught up here for now.</p>
			<p class="next-review">
				{lockedNote.locked} unlocks when {lockedNote.before} passes:
				{lockedNote.progress.seen} of {lockedNote.progress.total} seen,
				{lockedNote.progress.graduated} of {lockedNote.progress.graduatedNeeded} graduated.
			</p>
		{:else}
			<p>Congratulations you finished this deck for now! <span class="party"><PartyPopper /></span></p>
		{/if}
		{#if nextDue && !cram}
			<p class="next-review">Next review: {formatNextReview(nextDue)}</p>
		{/if}
	</div>
{/if}

<!-- The way in, for a pointer: zen's own key is z, but a mode with no button
     is a mode nobody finds. It shows only while the chrome does, and once zen
     is on the top-edge peek and Escape are the ways back. -->
{#if !zen.on}
	<div class="page-btns">
		<!-- cramming: every card here, due or not; the same button ends it -->
		{#if cram}
			<button class="page-btn" onclick={endCram}>End cram</button>
		{:else if studyCards.length}
			<button class="page-btn" onclick={chooseCram}>Cram</button>
		{/if}
		<button
			class="page-btn"
			title="Shortcut key: z"
			onclick={() => setZen(true)}
		>Zen mode</button>
	</div>
{/if}

<!-- What a cram session is started with, in the modal that asks. Enter
     starts it from anywhere among the choices. -->
{#snippet cramOptions()}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="cram-options"
		onkeydown={e => {
			if (e.key !== "Enter") return;
			e.preventDefault();
			settleModal(true);
		}}
	>
		{#each CRAM_ORDERS as option}
			<label>
				<input type="radio" name="cram-order" value={option.value} bind:group={cramChoice.order} />
				{option.label}
			</label>
		{/each}
		<label class="counts">
			<input type="checkbox" bind:checked={cramChoice.counts} />
			Answers count
		</label>
		<p class="cram-note">
			{#if cramChoice.counts}
				New, learning and due cards are graded and scheduled as in ordinary
				study. Cards not yet due are practice only.
			{:else}
				Practice only: no card's schedule changes.
			{/if}
		</p>
	</div>
{/snippet}

<style>
	/* bottom right of the window, out of the card's way: they belong to the
	   page rather than to the card, and the card is centred */
	.article-continue {
		display: flex;
		justify-content: center;
		margin-top: 24px;
	}
	.page-btns {
		position: fixed;
		right: 16px;
		bottom: 16px;
		z-index: 30;
		display: flex;
		gap: 8px;
	}
	.page-btn {
		border: 1px solid lightgrey;
		border-bottom: 1px solid darkgrey;
		background-color: #f5f5f5;
		border-radius: 4px;
		padding: 5px 12px;
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.55);
		cursor: pointer;
		transition: color 110ms ease, background-color 110ms ease;
	}
	.page-btn:hover {
		color: black;
		background-color: #f8f8f8;
	}
	.page-btn:active {
		transform: translateY(1px);
	}
	/* the choices in the modal that starts a cram session */
	.cram-options {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 8px;
		font-size: 0.95rem;
	}
	.cram-options label {
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}
	.cram-options input {
		accent-color: var(--accent);
	}
	.cram-options .counts {
		margin-top: 6px;
	}
	.cram-note {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.4;
		color: rgba(0, 0, 0, 0.6);
	}
	/* The floor is the whole card, answer included (--card-furniture, in
	   app.css), less the air the page keeps under it (--card-under): a
	   question stands down to the window's bottom instead of leaving the
	   answer's room empty below itself. Zen keeps the old floor, the
	   question alone, since its lift places the card by that. Layout inside
	   the card comes from app.css ("card board layout"), shared with browse. */
	/* zen: with the bars gone the card would sit against the window's edge, so
	   it takes twice its usual air above. The mode keeps it through a peek —
	   the bars sliding in is movement enough without the card shifting too */
	/* The one thing that differs by mode is how much air the card takes above
	   it; the chrome above that comes from the layout. Both feed the board's
	   height budget below, so the three modes can't drift apart. */
	/* zen centres the card (app.css), and the card's own margin is what makes
	   the top gap larger than the bottom one — so this is the bias itself,
	   not the air: a little high of centre, in every window. */
	.flashcard.zen {
		/* no margin of its own: a window the card nearly fills should centre it
		   evenly, and the bias below is the only thing that moves it down */
		--card-margin: 0px;
		--card-lead: 0px;
		--card-under: var(--card-answer);
		--page-bottom: 0px;
		/* The air the card may never eat into: it is taken out of the board's
		   height budget, so a short window shrinks the board rather than
		   pushing the card against the screen. Wider than the page's own 30px
		   — with no bars around it, the card is the only thing the window has
		   to frame — and wider again in fullscreen below, where the window's
		   own edges are gone too. */
		--zen-air-top: 40px;
		--zen-air-bottom: 35px;
		--zen-frame: calc(var(--zen-air-top) + var(--zen-air-bottom));
		/* Where the card hangs: a little over half the room left over by the
		   whole card, answer included — the air reads better above the card
		   than below it. Measured against the question instead, the lift
		   counted the answer's room as spare and spent nearly half of it
		   above the card, pushing the top gap down the window and the answer
		   against its bottom edge. The card still hangs from a fixed top, so
		   an answer longer than the room held for it grows downwards rather
		   than lifting the board. */
		--zen-room: calc(100dvh - var(--solo-board-size) - var(--card-furniture));
		/* On a window the board's height governs, the room left over IS the
		   frame, so the max() hands the top its share as asked. The ratio
		   only takes over on a window tall enough that the board stops at its
		   width instead: the leftover is larger than the frame there, and the
		   card centres in it, a little high. */
		/* The floor takes a share of the answer's room with it. Measured from
		   the question alone the card hung right at the top air, with the
		   answer's whole reserve below it — the question read high even though
		   the revealed card would sit true. Carrying part of that reserve
		   upwards brings the question towards the middle while leaving the
		   card most of its room to grow down into. */
		--zen-lift: max(
			calc(var(--zen-air-top) + var(--card-answer) * 0.4),
			calc(var(--zen-room) * 0.53)
		);
		/* A card with no board stands at the board's height all the same: one
		   card's top edge is every card's top edge, so the lift is computed
		   from the one budget, board or no board. A text card is a taller
		   sheet than its text needs, and that is the price of the deck not
		   moving under the reader between cards. */
		/* The bias is a luxury: on a window that the card nearly fills, an
		   uneven split is just a lopsided card, so it stays at zero until
		   there is room to spare and then takes a fifth of it, up to 20px.
		   It rides on top of --card-margin rather than in it, so the board's
		   height budget (which reads --card-margin) sees a constant. */
		--zen-bias: clamp(0px, (var(--zen-room) - 160px) * 0.2, 20px);
	}
	/* fullscreen: no window chrome either, so the card can afford more air
	   still. The board gives the difference back, as it does for the rest of
	   the frame. */
	/* The top takes more of that than the bottom: on a whole screen the card
	   reads too high sitting where a windowed one sits, so it hangs lower
	   here. The board pays for the extra, as it pays for the rest of the
	   frame, so what is under the card does not change. */
	@media all and (display-mode: fullscreen) {
		.flashcard.zen {
			--zen-air-top: 80px;
			--zen-air-bottom: 55px;
		}
	}
	.flashcard {
		align-items: center;
		--card-margin: 15px;
		/* The air under a revealed card — the furniture holds none of its own,
		   so this is the whole of it. Thinner than the 30px zen keeps at each
		   end of its frame: the page's own edge is below it either way, and
		   the room reads better spent on the card than under it. */
		--page-bottom: 0px;
		/* The gap under the deck's menu. It rides on top of the margin rather
		   than in it, so it lowers the card without taking the room out of the
		   board's budget below — what it spends is the slack the card already
		   leaves under itself. Zen has no menu above it, and no slack to
		   spare, so it drops this. */
		--card-lead: 6px;
		margin-top: calc(
			var(--card-margin) + var(--card-lead) + var(--zen-bias, 0px) + var(--zen-lift, 0px)
		);
		--board-height-budget: calc(
			var(--study-chrome, 110px) + var(--card-margin) + var(--card-furniture)
				+ var(--page-bottom, 24px) + var(--zen-frame, 0px)
		);
		/* The card stands at the height it was budgeted for: its board and the
		   whole furniture, the answer's room included. A question therefore
		   opens at the size it will keep, and the reveal fills room the card
		   was already holding instead of growing into the page. */
		--card-under: 30px;
		min-height: calc(var(--solo-board-size) + var(--card-furniture) - var(--card-under));
		/* No ceiling: a card with more in it than the budget holds grows
		   downwards and the page scrolls, as the reveal does. The height
		   above is a floor, so the cards that fit all stand alike. */
		/* the top is the card's rim, wider than the divider's 18px between
		   the sides; the row below closes the card at the 10px it has always
		   kept from the bottom edge */
		padding: 32px 37px 10px 37px;
	}
	/* The controls close the card, one centred row on one 20px rhythm. The
	   auto margin drops the row to the card's floor — on a card shorter than
	   the minimum height the slack belongs above the buttons, not below them
	   — and the padding holds their distance from the content once the card
	   is full. Bottom-aligned, since the due-time labels sit above the
	   rating buttons. */
	/* the counts hang in the row's bottom-right corner without displacing the
	   buttons, which stay centred on the card */
	.deck-counts {
		position: absolute;
		right: 0;
		/* the button's own padding and border, so the numbers sit on the same
		   line as the words in the row rather than on the row's box edge */
		bottom: 5px;
		/* not a flex row: a flex item is blockified, and an underline only
		   runs under an INLINE box's padding — which is what widens the rule
		   under the current count past its digit */
		white-space: nowrap;
		font-size: 0.9rem;
		font-weight: 500;
	}
	/* anki's deck browser colours: blue for new, rust for what is being
	   learned, green for the reviews coming round. A zero keeps its colour
	   here — the three are read as one running total, and a grey gap in the
	   middle of it breaks the line up */
	.deck-counts .new {
		color: #00a;
	}
	.deck-counts .learn {
		color: #c35617;
	}
	.deck-counts .review {
		color: #070;
	}
	/* the hair space that widens the underline, shrunk a touch further: the
	   space scales with its own font size, so this is the fine adjustment */
	.deck-counts .hair {
		font-size: 0.4em;
	}
	.deck-counts .plus {
		color: black;
		font-weight: 400;
		margin-inline: 1px;
	}
	/* which of the three the card on screen came from — underlined in its own
	   colour, as anki marks the queue it is drawing from */
	.deck-counts .current {
		text-decoration: underline;
		text-underline-offset: 1px;
	}
	/* the counts' mirror in the bottom-left corner, standing on the line the
	   button words stand on */
	.ladder {
		position: absolute;
		left: 0;
		bottom: 9px;
		display: flex;
		align-items: flex-end;
		gap: 2px;
	}
	.ladder .step {
		width: 7px;
		border-radius: 1px;
		background-color: rgba(0, 0, 0, 0.14);
	}
	/* the green of the reviews coming round: a climbed step is one earned */
	.ladder .climbed {
		background-color: #070;
	}
	.card-actions {
		position: relative;
		align-self: stretch;
		margin-top: auto;
		padding-top: 14px;
		display: flex;
		justify-content: center;
		align-items: flex-end;
		gap: 20px;
	}
	.side-actions {
		display: flex;
		gap: 20px;
	}
	.side-actions .std-btn {
		padding: 4px 8px;
	}
	/* the in-place card editor: same surface as the card it replaces, the
	   add-cards page's inner inset */
	/* sits on the grey above the card, the card's own width, as on the
	   add-cards page */
	.edit-type-row {
		width: 100%;
		max-width: var(--flashcard-width);
		margin: 24px auto 0 auto;
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 0.85rem;
		color: rgba(0, 0, 0, 0.6);
	}
	.flashcard-edit {
		width: 100%;
		max-width: var(--flashcard-width);
		margin: 6px auto 0 auto;
	}
	.flashcard-btn-row {
		display: flex;
		flex-direction: row;
		justify-content: center;
		align-items: flex-end;
		gap: 20px;
	}
	.flashcard-btn-row p {
		text-align: center;
		margin-bottom: 3px;
		font-size: 0.9rem;
		font-weight: 350;
	}
	.std-btn {
		padding: 4px 8px;
	}
	/* svg instead of an emoji: no color-emoji font on the user's system
	   required (Chromium on linux often has none) */
	.party {
		display: inline-block;
		vertical-align: -0.15em;
		font-size: 1.1em;
	}
	.party :global(svg) {
		display: block;
	}
	/* The panel sits 28% down the space it has to sit in. In zen that space
	   is the whole window rather than what the two bars leave, so the same
	   share is further down the page by 28% of the bars' ~110px — without it
	   the message rides visibly higher in zen than out of it. Fullscreen needs
	   nothing of its own: the dvh it is measured in already grew. */
	.deck-done {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		margin-top: 28dvh;
	}
	.deck-done.zen {
		margin-top: calc(28dvh + 30px);
	}
	.next-review {
		font-size: 0.9rem;
		color: rgba(0, 0, 0, 0.6);
	}
	/* a cram session's own count, where the deck's three stand: plain, since
	   it is one number and not three queues */
	.deck-counts.cram {
		color: rgba(0, 0, 0, 0.6);
	}
	.again-btn {
		margin-top: 8px;
	}
</style>
