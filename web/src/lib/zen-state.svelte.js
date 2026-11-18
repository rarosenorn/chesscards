// Zen mode: studying with the page's two bars out of the way — the site
// heading (StandardLayout) and the deck's breadcrumbs and tabs (the deck
// layout). They sit ABOVE the study page in the layout tree, so a context
// can't reach them; this module state can, and both layouts read it directly.
//
// `on` is the mode and lasts only as long as the visit — every arrival at a
// study page starts with the chrome up, and z is what takes it away — while
// `studying` says a study page is mounted. The bars hide only when both hold,
// so zen never leaks into Cards, Add cards or the deck list. `peeking` is the
// hover reveal: the pointer at the top of the window brings the bars back
// while it stays there, which is what keeps the mode from feeling like a trap.
// `choosing` is the deck switcher's menu open in the deck's bar: the bars
// stay until it is closed or a deck is chosen.
export const zen = $state({ on: false, studying: false, peeking: false, choosing: false });

// zen is in force on this page: the two top bars leave the flow, so the card
// rises into the room they were holding
export const zenActive = () => zen.on && zen.studying;

// ...and the peek puts them straight back, in the flow, so what returns is the
// ordinary layout — the card sits below them at its usual distance rather than
// under a floating copy of the chrome
export const zenHidden = () => zenActive() && !zen.peeking && !zen.choosing;

// A deck chosen from the switcher while in zen: the study page it leads to
// carries on in zen. Kept as the page's address, so a choice that opened
// elsewhere (a new tab) carries nothing to the next visit here.
let carryTo = null;
export const carryZenTo = href => { carryTo = zenActive() ? href : null };

// a study page starting up at its address: the mode is not remembered
// between visits, so it starts off and the user presses z to enter it,
// unless it is the deck just chosen from the switcher in zen
export const resetZen = href => {
	zen.on = href != null && href === carryTo;
	carryTo = null;
	zen.peeking = false;
	zen.choosing = false;
};

export const setZen = value => {
	zen.on = value;
	if (!value) zen.peeking = false;
}

// The bars come back while the pointer is at the top of the window, which
// is what keeps a chromeless page from being a trap. Two thresholds, not
// one: they slide in at the very edge but only leave once the pointer is
// clear of where they now sit, or a bar would vanish from under a cursor
// on its way to a tab.
const PEEK_IN = 40;
const PEEK_OUT = 150;
export const peekAt = y => {
	if (!zenActive()) return;
	if (y <= PEEK_IN) zen.peeking = true;
	else if (y > PEEK_OUT) zen.peeking = false;
}
