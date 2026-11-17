---
name: fc-line
argument-hint: <course variation title, e.g. "Three Knights 3.Nc3 Bc5 4.Nxe5 Bxf2+ #1"> [deck]
description: Turn one Chessable course variation into flashcards in the user's own opening-deck style (a tree of branch cards and "next N plies" cards up to the next branch, backs in the course's own words, every course point covered) and import them straight into the deck. Use when the user names a Chessable line/variation to card, or asks for cards "the same way" as the Sielecki deck.
---

# Cards from one Chessable variation

Default deck: `My First Chess Opening Repetoire - Christof Sielecki` (the user's
hand-made deck; spelling as in the app). Spec: `specs/sielecki-manual.json`,
one spec chapter per deck directly inside the deck. Course: Sielecki's 1.e4,
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

At a branch, the opponent's options go most common first: the main line's
cards before the side lines', and the same order for the arrows' bullets on
the branch card's back. The course's own order gives way to this.

- **Branch card** — "What are Black's 5 main moves after 4.Nxe5! ?" / "What
  are Black's 2 main moves after 6.d4, and how do they turn out?". Always this
  wording, with the number of moves the answer holds — never an open "What
  are Black's options after …". Board opens at the branch; one green
  `solutionArrows` arrow per candidate; back = a bullet per candidate with the
  author's verdict.
- **Move card** — "What is your move after 3...Bc5?! and why?". Board opens at
  the position (the board itself tints the squares of the opponent's last
  move — no arrow for it), the answer as a green `solutionArrows` arrow; back = the move and the author's
  reason. Add a second ask where the course has one ("Which bishop move is less
  precise?").
- **Line card** — "What are the next 5 plies following 4...Bxf2+?!". One card
  for the whole stretch from the question to the next branch (or the line's
  end), never chunked: the number is however many plies that stretch holds.
  The board carries the whole line including the answer; `openAt` and
  `solutionFrom` at the question; back
  = one "- " bullet per ply: "- 5.Kxf2 We have to take the bishop, no choice."
- **Refutation card** — one per bad opponent move the course refutes
  (4...Qh4?, 4...Nf6?), as a move or line card from the position after it.
- **Why-not card** — for "Black can't play X because Y" and "why not our
  natural move": the position, both candidate arrows on reveal, the reason.
- **Plan card** — "After 9...h6, what is your plan?", back = the author's plan.

**The opponent's move is already played on the board** (openAt is the ply
after it) — never a board that stops before the move with an arrow pointing
ahead. No arrow marks it: the app tints the from and to squares of the move
the board stands on (since 2026-10-02), so a last-move arrow is redundant.

Orientation: the deck's side (white for Sielecki 1.e4). Prompts are plain and
short; no bold.

## 4. Wording

Backs use **the course's own sentences**, trimmed — not paraphrase. Where the
course gives no reason (e.g. "easily defused"), add a short factual one, prefixed
"claude:" on the card ("- 5...dxc6 claude: Black recaptures."), and say so in
the final message. **The answer and the line that explains it ride on the board as back moves**
(`moves` past `solutionFrom`), not in the text: a move card's board carries
the answer move and the author's continuation after it ("4.Nxe5, based on the
idea 4...Nxe5 5.d4" → moves ...Bc5 | Nxe5 Nxe5 d4), with the green answer
arrow kept on reveal. Brackets are only for lines that leave that one line —
alternatives, refutations, "can't play X". Put those side lines in brackets so
they play on the board: `[4...Nf6 5.Nxc6 dxc6 6.h3]`, `[7.Bd3 Qf6+]` (syntax
in `web/scripts/import-deck.mjs`). Every bracketed line **starts with its own
first move, numbered** so it hangs at the right ply — `[4...Nf6 5.Nxc6 dxc6
6.h3]`, `[7.Bc4]` — and never with the board-line move it branches from: a
line opens (Shift+arrows) on its own first move, played and tinted on the
board, and steps back only to the position that move is played in (since
2026-10-04). On a branch card
**every candidate is a bracketed line**, even a single move (`[4...Bxf2+]?!`),
so Shift+arrows step through them all. Annotation marks go after
the bracket when they belong to its last move; inside a bracket they are
dropped. Never brackets on moves the board's own
line plays, never in a front that would give the answer away.

## 5. A whole course chapter: Quickstart first

A course chapter (asked for by name, e.g. "the Scandinavian chapter") becomes:

- **Quickstart cards** — one per trainer line of the chapter, in the deck's
  first chapter "Quickstart" after the previous course chapter's, most common
  line first (as the subdecks), so the skeleton is learned before the detail. Front "Play the <opening> line with 4...X and 5...Y from the first
  move." (course marks kept: "4...Bxf2+?!"); board from the start position,
  the whole trainer line, `solutionFrom: 0`, `puzzle: true`; back = one "- "
  bullet per ply in the course's words ("claude:" where it gives none), no side
  lines. Ids `<prefix>-ov-<line>` with a prefix new to the deck (`fr-ov-dxc4`).
- **Orange arrows** — on each Quickstart line card, at the ply right after
  each Black move from Black's 3rd move on, one `["warning", from, to]` arrow
  per other Black move at that position in any Quickstart line. Never for
  Black's 1st or 2nd move; never for our moves. Written by
  `cd web && node scripts/quickstart-arrows.mjs ../specs/sielecki-manual.json --write`
  (without `--write` it lists the cards whose arrows differ).
- **Quickstart move text** — then, from the repo root,
  `python3 web/scripts/sielecki-movetext.py`: it ends every Quickstart line
  card's back with its line as move text, the same chapter's other lines in
  parens (course marks kept). It groups cards by id prefix: add the new prefix
  to `group_of` if it should share a group. Both scripts are rerunnable.
- **A subdeck per variation** with the tree in §3, named after the variation
  ("4...Nf6 5...Bb4"), inside a chapter named after the course chapter; what the
  variations share is carded once, at the start of the first.

## 6. Spec and import

Append a chapter (named after the course variation group, e.g. "Three Knights
3...Bc5") or extend the existing one for the same course chapter. Every card a
stable, never-reused `id`. Boards: start FEN
`rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`, the full SAN line,
`openAt`, `solutionFrom`, `arrows`/`solutionArrows` keyed by ply index as
strings, arrows `["success", from, to]`. Every board with a `solutionFrom`
gets `"puzzle": true` — in study the answer is played on the board, not
revealed. A puzzle's first hidden move is always ours: open it after the
opponent's move, never before it.

```bash
cd web && node scripts/import-deck.mjs ../specs/sielecki-manual.json          # dry run, must pass
cd web && node scripts/import-deck.mjs ../specs/sielecki-manual.json --apply
```

Look at the dry run before `--apply`: updates you did not make are the user's edits in
the app; stop and ask. Then commit the spec and its `.lock.json`. Report in two lines: chapter,
card count, and any reason you supplied that the course did not.
