---
name: fc-line
argument-hint: <course variation title, e.g. "Three Knights 3.Nc3 Bc5 4.Nxe5 Bxf2+ #1"> [deck]
description: Turn one Chessable course variation into flashcards in the user's own opening-deck style (a tree of branch cards and "next 3 plies" cards, backs in the course's own words, every course point covered) and import them straight into the deck. Use when the user names a Chessable line/variation to card, or asks for cards "the same way" as the Sielecki deck.
---

# Cards from one Chessable variation

Default deck: `My First Chess Opening Repetoire - Christof Sielecki` (the user's
hand-made deck; spelling as in the app). Spec: `specs/sielecki-manual.json`,
one spec chapter per deck chapter. Course: Sielecki's 1.e4,
https://www.chessable.com/learn/188863. Another deck → its own spec in
`specs/`, named after it.

No draft round: build, import, commit, then tell the user to check the cards
in the app. They review there and ask for edits.

## 1. Read the variation

Claude in Chrome, in a tab of your own. Open the course URL, click the
variation's title in the left sidebar (use `find`), then the book icon at the
top right of the side panel for book mode, and `get_page_text`. Read only the
named variation. **Never answer MoveTrainer prompts** — that writes study
progress to the user's account. Close the tab when done.

The text is the course line with the author's prose after each move, plus the
chapter introduction every variation of the chapter repeats.

## 2. List every course point first

Before writing a card, list every point the text makes — this is the
coverage contract, the cards must cover all of it:

- each move of the main line and the reason given for it
- every alternative the author names, for either side: lettered options
  (A/B/C/D), "?"/"??"/"?!" moves, "you can also consider", "less precise"
- every trap and refutation, including one-liners like "4...Qh4? 5.g3 is
  easily defused" — each gets its own card
- evaluations and plans ("our king is vulnerable", "Qe1-g3, Be3, double rooks")
- sample continuations given in prose

Every item ends up either as a card's question or on a card's back. Nothing
the course says is left out because it looked minor.

## 3. Card shapes

Follow the tree: at each branch a card asking which moves we look at, then a
card per line until the next branch. Always context, and ask why.

- **Branch card** — "What are Black's options after 4.Nxe5! ?" / "What are
  Black's 2 most common responses to 6.d4?". Board opens at the branch; one
  green `solutionArrows` arrow per candidate; back = a bullet per candidate
  with the author's verdict.
- **Move card** — "What is your move after 3...Bc5?! and why?". Board opens at
  the position, the opponent's last move as a green `arrows` arrow there, the
  answer as a green `solutionArrows` arrow; back = the move and the author's
  reason. Add a second ask where the course has one ("Which bishop move is less
  precise?").
- **Line card** — "What are the next 3 plies following 4...Bxf2+?!". The board
  carries the whole line including the answer; `openAt` and `solutionFrom` at
  the question; opponent's last move as a green `arrows` arrow at openAt; back
  = one "- " bullet per ply: "- 5.Kxf2 We have to take the bishop, no choice."
  Chunk longer lines into 3-ply cards.
- **Refutation card** — one per bad opponent move the course refutes
  (4...Qh4?, 4...Nf6?), as a move or line card from the position after it.
- **Why-not card** — for "Black can't play X because Y" and "why not our
  natural move": the position, both candidate arrows on reveal, the reason.
- **Plan card** — "After 9...h6, what is your plan?", back = the author's plan.

**The opponent's move is already played on the board** (openAt is the ply
after it) and its green arrow runs from the square it came from to where the
piece now stands — never a board that stops before the move with the arrow
pointing ahead. The user prefers this over their own Philidor cards.

Orientation: the deck's side (white for Sielecki 1.e4). Prompts are plain and
short; no bold.

## 4. Wording

Backs use **the course's own sentences**, trimmed — not paraphrase. Where the
course gives no reason (e.g. "easily defused"), add a short factual one and
say so in the final message. Put side lines the author gives in brackets so
they play on the board: `[4...Nf6 5.Nxc6 dxc6 6.h3]`, `[7.Bd3 Qf6+]` (syntax
in `web/scripts/import-deck.mjs`). Never brackets on moves the board's own
line plays, never in a front that would give the answer away.

## 5. Spec and import

Append a chapter (named after the course variation group, e.g. "Three Knights
3...Bc5") or extend the existing one for the same course chapter. Every card a
stable, never-reused `id`. Boards: start FEN
`rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`, the full SAN line,
`openAt`, `solutionFrom`, `arrows`/`solutionArrows` keyed by ply index as
strings, arrows `["success", from, to]`.

```bash
cd web && node scripts/import-deck.mjs ../specs/sielecki-manual.json          # dry run, must pass
cd web && node scripts/import-deck.mjs ../specs/sielecki-manual.json --apply
```

Then commit the spec and its `.lock.json`. Report in two lines: chapter,
card count, and any reason you supplied that the course did not.
