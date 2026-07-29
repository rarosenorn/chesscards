#!/usr/bin/env python3
"""Pick 10 popular puzzles for a named mate, bracketed by rating.

Usage: pick_puzzles.py <theme> <outfile.ods>

Only puzzles with exactly one solution are accepted: at every position where the
solver is to move, exactly one legal move must force mate in the moves that
remain. PuzzleIds already used by another .ods in the output directory are
skipped.
"""
import subprocess, sys, csv, io, re
from pathlib import Path

import chess
from odf.opendocument import OpenDocumentSpreadsheet, load
from odf.table import Table, TableRow, TableCell
from odf.text import P

THEME, OUT = sys.argv[1], Path(sys.argv[2])
ROOT = Path(__file__).resolve().parents[4]
DUCKDB = ROOT / "scratch" / "duckdb"
DB = ROOT / "scratch" / "puzzles.duckdb"

# (name, rating range, count)
BRACKETS = [
    ("Simple", "Rating >= 1100 AND Rating < 1300", 3),
    ("Intermediate", "Rating >= 1400 AND Rating < 1600", 3),
    ("Hard", "Rating >= 1600 AND Rating < 1800", 2),
    ("Very hard", "Rating >= 1800 AND Rating < 2000", 2),
]
CANDIDATES = 60        # rows pulled per bracket to have replacements for rejects
MATE_NODES = 400_000   # search budget per puzzle; a mate in 4 needs ~250k


# --- unique-solution check -------------------------------------------------

class OverBudget(Exception):
    pass


def _mating_moves(board, n, budget, memo, first_only=False):
    """Moves for the side to move that force mate within n of its own moves."""
    if first_only:
        key = (board._transposition_key(), n)
        hit = memo.get(key)
        if hit is not None:
            return hit
    # a mate in 1 has to be a check, so only checks are worth trying at the leaf
    if n == 1:
        candidates = [m for m in board.legal_moves if board.gives_check(m)]
    else:
        candidates = sorted(board.legal_moves,
                            key=lambda m: (not board.gives_check(m), not board.is_capture(m)))
    found = []
    for move in candidates:
        budget[0] -= 1
        if budget[0] < 0:
            raise OverBudget
        board.push(move)
        try:
            if board.is_checkmate():
                found.append(move)
            elif n > 1 and board.legal_moves and _all_replies_mated(board, n - 1, budget, memo):
                found.append(move)
        finally:
            board.pop()
        if first_only and found:
            break
    if first_only:
        memo[key] = found
    return found


def _all_replies_mated(board, n, budget, memo):
    replies = list(board.legal_moves)
    if not replies:
        return False                      # stalemate, not mate
    for m in replies:
        board.push(m)
        try:
            if not _mating_moves(board, n, budget, memo, first_only=True):
                return False
        finally:
            board.pop()
    return True


def sole_solution(board, solution):
    """(ok, reason) — is `solution` the only way to mate from `board`?"""
    board = board.copy()
    budget, memo = [MATE_NODES], {}
    for i, mv in enumerate(solution):
        if i % 2 == 0:                    # solver to move
            remaining = (len(solution) - i + 1) // 2
            try:
                alts = _mating_moves(board, remaining, budget, memo)
            except OverBudget:
                return False, f"mate search too deep (over {MATE_NODES} nodes)"
            if mv not in alts:
                return False, f"{board.san(mv)} is not a fastest mate"
            if len(alts) > 1:
                return False, (f"{len(alts)} mates in {remaining} "
                               f"({', '.join(board.san(a) for a in alts)})")
        board.push(mv)
    return True, ""


# --- picking ---------------------------------------------------------------

def ods_text(path):
    doc = load(path)
    return " ".join(str(p) for p in doc.spreadsheet.getElementsByType(P))


def query(where, limit):
    sql = f"""
        SELECT PuzzleId, FEN, Moves, Rating, Popularity, NbPlays
        FROM puzzles
        WHERE Themes LIKE '%{THEME}%' AND RatingDeviation <= 100 AND {where}
        ORDER BY Popularity DESC, NbPlays DESC, PuzzleId
        LIMIT {limit};
    """
    out = subprocess.run([DUCKDB, "-csv", DB], input=sql, capture_output=True, text=True, check=True)
    return list(csv.DictReader(io.StringIO(out.stdout)))


def render(row, bracket):
    """Row for the sheet, plus the front position, or None if not a sole solution."""
    board = chess.Board(row["FEN"])
    line = [chess.Move.from_uci(m) for m in row["Moves"].split()]
    board.push(line[0])                   # opponent's setup move
    ok, why = sole_solution(board, line[1:])
    if not ok:
        print(f"reject {row['PuzzleId']}: {why}", file=sys.stderr)
        return None
    san = board.variation_san(line[1:])
    side = "White" if board.turn == chess.WHITE else "Black"
    return [row["PuzzleId"], bracket, int(row["Rating"]), int(row["Popularity"]),
            int(row["NbPlays"]), side, board.fen(), san,
            f"https://lichess.org/training/{row['PuzzleId']}"]


# ids already used by any other deck file in the folder
used = set()
for f in OUT.parent.glob("*.ods"):
    if f != OUT:
        used |= set(re.findall(r"lichess\.org/training/(\w+)", ods_text(f)))

rows_out = []
for name, where, want, in BRACKETS:
    picked = []
    for row in query(where, CANDIDATES):
        if len(picked) == want:
            break
        if row["PuzzleId"] in used:
            continue
        rendered = render(row, name)
        if rendered:
            picked.append(rendered)
            used.add(row["PuzzleId"])
    if len(picked) < want:
        print(f"warning: {name} has only {len(picked)}/{want} puzzles", file=sys.stderr)
    rows_out += picked

doc = OpenDocumentSpreadsheet()
table = Table(name=OUT.stem)
HEADER = ["Puzzle", "Bracket", "Rating", "Popularity", "Plays", "To move", "FEN", "Solution", "Link"]
for values in [HEADER] + rows_out:
    tr = TableRow()
    for v in values:
        cell = TableCell(valuetype="float", value=v) if isinstance(v, int) \
            else TableCell(valuetype="string")
        cell.addElement(P(text=str(v)))
        tr.addElement(cell)
    table.addElement(tr)
doc.spreadsheet.addElement(table)
doc.save(OUT)
print(f"wrote {OUT} ({len(rows_out)} puzzles)")
