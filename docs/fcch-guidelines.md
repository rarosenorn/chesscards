# Chess flashcard guidelines

How Claude creates chess flashcards from a book, for the chesscards app.
Invoked via `/fcch`. The card-quality principles are shared with
`/home/kvothe/bio/fc-guidelines.md` — read that file too; this one covers only
what is different for chess. Where the two disagree about chess, this file
wins.

## Workflow

1. Extract the named chapter/section from the book PDF in `/home/kvothe/books/`
   (they are large — use `pdftotext` on the page range; find the range by
   extracting the whole text once and locating the chapter heading).
2. Draft the cards per the rules below.
3. Show the cards in the reply as readable pairs — position, prompt, answer —
   and wait for approval. Do NOT write anything yet.
4. After approval, write a spec JSON and import it:
   `cd /home/kvothe/chesscards/web && node scripts/import-deck.mjs <spec> --apply`
   (run it without `--apply` first — that validates and reports without
   writing). Specs live in `/home/kvothe/chesscards/specs/`.

   **Every card needs a stable `id`**, unique within the spec and never
   recycled. The importer keeps `<spec>.lock.json` mapping id to card, so
   editing a card updates it in place and its review history survives.
   Reordering cards in the spec reorders the chapter. Dropping a card from the
   spec is reported but not acted on; `--prune` deletes it, and says so when
   the card had been studied. Never fix a card by deleting and re-adding it —
   that throws away everything the scheduler has learned.
5. If a correction looks like a general preference, propose adding it here and
   ask before writing it.

## Deck, chapter, card

The app has no tags. The only structure is **deck → chapter → position**
(`stages` in the schema, displayed as "Chapter").

- **deck** = one opening, from the player's side (e.g. "Caro-Kann").
- **chapter** = one variation section.
- **position within chapter** = the order cards are studied.

### Chapters come from the book, and then they are fixed

Default to the author's own subsections — they thought about the division, and
a book chapter for one opening already subdivides by variation. FCO's Caro-Kann
chapter, for instance, gives Exchange Variation / Panov Attack / Advance
Variation / 3 Nc3, 3 Nd2 / Classical Variation / 4...Nd7 / 4...Nd7 5 Bc4 /
4...Nd7 5 Ng5.

The last argument to `/fcch` may override this with a free-text instruction
("divide by Black's third move", "main lines first, sidelines last").

**The scheme is decided once per deck, not per invocation.** A deck is built
over many sessions; chapter two cannot re-decide the division. So:

- On the first run for a deck, establish the chapters and record the scheme in
  the "Decks" section at the bottom of this file.
- On later runs, read that record and the deck's existing chapters and treat
  them as authoritative. Slot new cards into the matching chapter; create a new
  chapter only for genuinely new material, appended at the end.

### Chapter order is by popularity, not by the book

Chapter order is study order: the app gates a chapter behind 80% of the
previous one being graduated (`GRADUATED_SHARE` in `web/src/lib/stages.js`).
Books order sections by theoretical completeness, so following the print order
means grinding rare lines to 80% before reaching the one you actually face.

So take the *division* from the book and the *order* from how often the line is
played at the user's level — most common first. FCO's Caro-Kann runs Exchange →
Panov → Advance; the deck runs Advance first. State the reordering in the draft
so it is a visible decision.

The first chapter is always an **Overview** (see below), regardless of the
book's structure.

## The Overview chapter

Every opening deck opens with an Overview chapter, built from the book's own
chapter introduction. It covers: the first moves and *why* they are played
(the idea that distinguishes this opening from its neighbours), the main
strategic upside and downside, and which variations exist with roughly how
often each is met.

**Overview cards ask for recognition; variation chapters ask for moves.** This
is not a style preference — the importer skips any card whose front already
exists in the deck, so an overview card posing the same position as a variation
card would be silently dropped. Keep them structurally distinct:

- Overview: *"3 e5 — which variation is this, and what is Black's plan?"*
- Advance chapter: *"White has played 3 e5. What do you play, and why?"*

History follows the general rule in `/home/kvothe/bio/fc-guidelines.md`: not
carded by default, listed separately in the draft as candidates for the user to
pick from. The parts worth keeping are usually evaluation rather than history
("long dismissed as drawish, which is now known to be wrong").

## Statistics

Frequencies are worth carding — knowing that you will meet the Advance far more
often than the Fantasy is what tells you where to spend effort. But they move,
and they differ by rating band, so a bare percentage rots.

Every statistic on a card carries its source, rating band and date:

> Q: After 1 e4 c6 2 d4 d5, how often does White play 3 e5 (Advance)?
> A: C: about 40% — the most common choice. (Lichess, 2000-2200, Aug 2026)

Prefer the rank ordering to the exact number where both would do — rank is what
you act on and it is far more stable. Where the book gives no figures, source
them from the Lichess opening explorer filtered to the user's rating band, and
say so on the card.

## The atom is a position, not a line

This is the rule that matters most. **Never card a whole variation as one
card.** A ten-move line as a single card is unreviewable: you fail on move 9
and re-drill the eight moves you already knew, and the scheduler can never
separate the part you know from the part you don't.

One card per **decision point** — a position where the player to move has
something to get right. A ten-move line becomes four or five cards, each
scheduled independently.

- Only card decisions for **the side the deck is for**. The opponent's moves
  are context, not answers.
- **One board, on the front — never a copy of it on the back.** A front board
  carries its own answer layer: study renders the front with
  `revealed = isCardTurned` (`study/+page.svelte`), so turning the card
  reveals that board's hidden moves and annotations **in place**. Putting a
  plain board on the front and a solved copy on the back shows the position
  twice on the answer screen and is always wrong. The back is for prose.
- The moves leading to the position are context on the front. Put them in the
  board's `moves` with `solutionFrom` set to the index where the answer
  begins: everything before it shows on the front, everything from it is
  hidden until the card is turned.
- **Anything that gives the answer away must ride the solution layer.**
  `annotations` (`arrows`/`markers`) show immediately, including before the
  turn; `solutionAnnotations` (`solutionArrows`/`solutionMarkers`) appear only
  on reveal, and they work independently of `solutionFrom` — a board with no
  moves at all can still reveal arrows on turning. Use the plain layer only
  for marking part of the *question*.
- Set `orientation` to the side being played, always. A Caro-Kann deck is
  studied from Black's side.

## Card types

**Move cards** — a position, "what do you play and why?", answer = the move
plus one line of reasoning. The backbone of an opening deck. The *why* is not
optional: a move memorized without its idea does not survive the first
deviation.

**Plan cards** — "what is Black's plan in this structure?", "which piece is
White's problem piece and why?". Prose, no single forced move. These are the
cards that make the repertoire transferable, and they are the ones books like
FCO are actually written to teach. Do not let move cards crowd them out.

**Trap and refutation cards** — "White has just played X, which loses a pawn —
how?". Card the punishment for the natural mistake, not every sideline.

**Tactic cards** (`card_type: "tactic"`) bypass FSRS entirely and are graded
once, then finished forever. Use them only for one-off puzzle drills, never for
repertoire knowledge.

## Density

Focused, not exhaustive. An opening book gives far more than a player needs:
FCO deliberately covers every respectable line, including ones nobody will
meet. Card the main line deeply and the sidelines only to the depth of "know
the first few moves and the idea".

Do not card:

- Lines the book itself flags as rare, dubious or historical.
- Evaluation prose that is not actionable ("the position is roughly balanced").
- Move-order subtleties beyond the player's level.
- The opening's history, naming, or who played it — same rule as `/fc`.

Depth heuristic: main lines to the point where the middlegame plan is clear
(often 10-12 moves); sidelines to the branch point plus the refuting idea.

## Positions and FENs

Book diagrams are usually **images** — the FEN is not in the text, only the
moves are. So derive positions by replaying the moves from the move-one
starting position with chess.js, and give the card either the derived FEN, or
the standard start position plus the full move list.

Every FEN and every SAN line must be validated before import. The importer
(`web/scripts/import-deck.mjs`) does this — strict FEN, chess.js replay,
annotation bounds, `solutionFrom` bounds — and writes nothing if any card
fails. Nothing on the server validates content, so a spec that skips the
importer's checks will silently store broken cards.

## Annotations

Arrows and markers (`success | warning | info | danger`) go on the **answer**
side, to show the idea rather than restate the move: the diagonal a bishop
wants, the square a knight is heading for, the pawn-break target. Use them
sparingly — a board covered in arrows teaches nothing.

**Never draw an arrow along a move that the board already plays.** The move
line under the board names every move and the pieces visibly move, so an arrow
from c8 to f5 beside the move `3...Bf5` is pure noise. Arrows earn their place
only where there is no move to read: a move being *recommended* but not played,
a plan several moves ahead, a line of force, a square under pressure. If a
board's arrow and one of its `moves` describe the same thing, drop the arrow.

## Inherited from `/fc`

These carry over unchanged and are not repeated here: atomicity, precision,
tractability, effortful fronts, concise answers, redundancy and both-direction
asking, comparative cards, examples, context-free phrasing, and
**correctness outranks faithfulness** — where the book is wrong or its analysis
has been superseded, card the corrected version, say so on the card, and flag
it in the draft.

One chess-specific addition to that last rule: opening theory ages. Where a
book's recommendation is known to have been refuted or fallen out of favour,
flag it at the draft stage rather than carding it as current.

## Decks

Record each deck's source and chapter scheme here as it is created.

### Caro-Kann — created 2026-08-20

Source: FCO (*Fundamental Chess Openings*, Van der Sterren), Caro-Kann Defence
chapter, `~/books/fco.pdf` pages 1197-1245. Studied from Black's side.
Spec: `~/chesscards/specs/caro-kann.json`.

Division: FCO's own subsections, plus an Overview first and a Sidelines last.
Order measured from the Lichess explorer, 1400-1800, all time controls,
Aug 2026 (78M games) — after 1 e4 c6 2 d4 d5: 3 e5 41%, 3 exd5 31%, 3 Nc3 19%,
3 f3 3%, 3 Nd2 3%, 3 Bd3 1%, 3 Nf3 0%.

1. Overview
2. Advance Variation (3 e5) — 41%
3. Exchange Variation (3 exd5) — 31% with Panov
4. Panov Attack (3 exd5 cxd5 4 c4)
5. Classical Variation (3 Nc3/Nd2 dxe4 4 Nxe4 Bf5) — 22% combined
6. 4...Nd7
7. 4...Nd7 5 Bc4
8. 4...Nd7 5 Ng5
9. Sidelines — FCO's alternatives to 2 d4: 2 d3 (King's Indian Attack),
   2 Nc3/2 Nf3 (Two Knights), 2 c4

FCO's print order is Exchange -> Panov -> Advance; this deck leads with the
Advance and puts the Classical after the Exchange, per the measured
frequencies.
