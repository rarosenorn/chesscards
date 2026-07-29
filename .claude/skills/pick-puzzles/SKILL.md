---
name: pick-puzzles
description: Pick 10 Lichess puzzles for a named checkmate pattern (Anastasia's mate, Boden's mate, smothered mate, …) spread over four rating brackets, and write them to an .ods in puzzle-picks/. Use when asked to find, pick, or refresh puzzles for a mate theme or a mate-pattern deck.
---

# Picking puzzles for a mate theme

`scripts/pick_puzzles.py` does the whole job. Run it and report the result:

```bash
scratch/venv/bin/python .claude/skills/pick-puzzles/scripts/pick_puzzles.py <theme> puzzle-picks/<name>-puzzles.ods
```

`<theme>` is the Lichess theme tag, e.g. `anastasiaMate`, `bodenMate`, `smotheredMate`,
`arabianMate`, `dovetailMate`, `hookMate`. It is matched as a substring of the `Themes`
column, so it must be spelled exactly as Lichess does.

Takes a few minutes: every candidate is verified by an exhaustive mate search, and a
mate-in-4 costs ~20s.

## The rules the script enforces

**Exactly one solution.** A puzzle is only accepted if, at *every* position where the
solver is to move, exactly one legal move forces mate within the remaining moves. Lichess
does not guarantee this — mate themes routinely have two mates in 1 at the end, or two
distinct mating attacks from the start — so this is the filter that matters most. A
puzzle whose recorded line is not the fastest mate is also rejected.

Uniqueness means unique *fastest* mate. A slower alternative mate does not disqualify a
puzzle; Lichess would reject that move at the board anyway.

**Ten puzzles, four brackets.**

| Bracket      | Rating    | Count |
|--------------|-----------|-------|
| Simple       | 1100–1300 | 3     |
| Intermediate | 1400–1600 | 3     |
| Hard         | 1600–1800 | 2     |
| Very hard    | 1800–2000 | 2     |

(1300–1400 is deliberately skipped, to keep the first two brackets clearly apart.)

**Most popular first.** Within a bracket, candidates are taken in `Popularity DESC,
NbPlays DESC` order and accepted until the bracket is full, so a rejected puzzle is
replaced by the next most popular one. `RatingDeviation <= 100` only, to keep the ratings
meaningful.

**No repeats across decks.** Puzzle IDs already present in any other `.ods` in the output
directory are skipped, so decks never share a puzzle.

## Output

One sheet, one row per puzzle:

`Puzzle | Bracket | Rating | Popularity | Plays | To move | FEN | Solution | Link`

The FEN is the position *after* the opponent's setup move — the position the solver
actually sees, i.e. the card front. `Solution` is SAN from that position.

## Reporting back

The script prints rejections to stderr (`reject <id>: <reason>`). Pass on anything worth
knowing: how many puzzles each bracket got, and any bracket that came up short — a rare
mate pattern may not have enough unique-solution puzzles at every rating, and a short
bracket is a real finding, not something to paper over by widening the range.

## Prerequisites

All in `scratch/` (gitignored, not in the repo):

- `scratch/duckdb` — the DuckDB CLI binary.
- `scratch/puzzles.duckdb` — a `puzzles` table loaded from the [Lichess puzzle
  database](https://database.lichess.org/#puzzles) CSV
  (`PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, …`).
- `scratch/venv` — a virtualenv with `chess` and `odfpy`.

If any of these are missing, say so rather than rebuilding them silently: the puzzle
database is a ~250 MB download.
