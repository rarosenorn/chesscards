// Desired retention: the chance of recalling a card that FSRS aims for when it
// comes back (Anki's "desired retention"). The user picks it in Settings.
// 95% by default rather than FSRS's 90%: a half-remembered opening line is a
// lost game, so recall is worth the extra reviews (about 1.5-2x).
const RETENTIONS = [0.8, 0.85, 0.9, 0.95, 0.97];
const DEFAULT_RETENTION = 0.95;

export { RETENTIONS, DEFAULT_RETENTION }
