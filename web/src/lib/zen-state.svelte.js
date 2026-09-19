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
export const zen = $state({ on: false, studying: false, peeking: false });

// zen is in force on this page: the two top bars leave the flow, so the card
// rises into the room they were holding
export const zenActive = () => zen.on && zen.studying;

// ...and the peek puts them straight back, in the flow, so what returns is the
// ordinary layout — the card sits below them at its usual distance rather than
// under a floating copy of the chrome
export const zenHidden = () => zenActive() && !zen.peeking;

// a study page starting up: the mode is not remembered between visits, so it
// starts off and the user presses z to enter it
export const resetZen = () => { zen.on = false; zen.peeking = false };

export const setZen = value => {
	zen.on = value;
	if (!value) zen.peeking = false;
}
