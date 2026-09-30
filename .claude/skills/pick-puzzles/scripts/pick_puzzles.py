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

# (name, rating range, count) — two spare per bracket, to be picked over by hand
BRACKETS = [
    ("Simple", "Rating >= 1600 AND Rating < 1750", 3 + 2),
    ("Intermediate", "Rating >= 1750 AND Rating < 1900", 3 + 2),
    ("Hard", "Rating >= 1950 AND Rating < 2100", 2 + 2),
    ("Very hard", "Rating >= 2100 AND Rating < 2300", 2 + 2),
]
CANDIDATES = 200       # rows pulled per bracket to have replacements for rejects
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


# --- the mating picture, per theme ----------------------------------------
#
# The Lichess tag says the mate LOOKS like the pattern; it does not say the
# pattern is pure. A theme listed here is checked position by position, so a
# card only teaches the constellation it is named after.

def _hook_mate(board):
    """Rook checking from beside the king, defended by a knight with a pawn
    behind it, and the king shut in by exactly one of his own pawns."""
    loser, winner = board.turn, not board.turn
    king = board.king(loser)
    checkers = list(board.checkers())
    rook = next((s for s in checkers if board.piece_type_at(s) == chess.ROOK
                 and chess.square_distance(s, king) == 1), None)
    if len(checkers) != 1 or rook is None:
        return "no lone rook checking from beside the king"
    knights = [s for s in board.attackers(winner, rook)
               if board.piece_type_at(s) == chess.KNIGHT]
    if not knights:
        return "the mating rook is not defended by a knight"
    if not any(board.piece_type_at(d) == chess.PAWN
               for n in knights for d in board.attackers(winner, n)):
        return "the defending knight has no pawn behind it"
    neighbours = [s for s in chess.SQUARES if chess.square_distance(s, king) == 1]
    own = sorted(board.piece_type_at(s) for s in neighbours if board.color_at(s) == loser)
    if own != [chess.PAWN]:
        blocking = ", ".join(chess.piece_name(t) for t in own) or "nothing"
        return f"the king is hemmed in by {blocking}, not by a single pawn"
    # the king's remaining flights, seen through his own square — the rook
    # covers the rank/file he would step along
    bare = board.copy(stack=False)
    bare.remove_piece_at(king)
    guards = {bare.piece_type_at(a) for s in neighbours if bare.color_at(s) != loser
              for a in bare.attackers(winner, s)}
    extra = guards - {chess.ROOK, chess.KNIGHT, chess.PAWN}
    if extra:
        helpers = ", ".join(sorted(chess.piece_name(t) for t in extra))
        return f"the net also needs {helpers}"
    return None


PURE = {"hookMate": _hook_mate}


def _picture(board):
    """The mating picture: where the mated king stands, and what mates it."""
    return (chess.square_name(board.king(board.turn)),
            tuple(sorted(board.piece_type_at(s) for s in board.checkers())))


def _pictures(board, n, budget, memo, out, impure, pure=None):
    """Every mating picture reachable in the forced-mate tree, over all defenses."""
    for mv in _mating_moves(board, n, budget, memo):
        board.push(mv)
        try:
            if board.is_checkmate():
                out.add(_picture(board))
                if pure:
                    why = pure(board)
                    if why:
                        impure.add(why)
            else:
                for defense in board.legal_moves:
                    board.push(defense)
                    try:
                        _pictures(board, n - 1, budget, memo, out, impure, pure)
                    finally:
                        board.pop()
        finally:
            board.pop()


def sole_solution(board, solution):
    """(ok, reason) — is `solution` the only way to mate, and always the same mate?"""
    front = board.copy()
    board = board.copy()
    budget, memo = [MATE_NODES], {}
    try:
        for i, mv in enumerate(solution):
            if i % 2 == 0:                # solver to move
                remaining = (len(solution) - i + 1) // 2
                alts = _mating_moves(board, remaining, budget, memo)
                if mv not in alts:
                    return False, f"{board.san(mv)} is not a fastest mate"
                if len(alts) > 1:
                    return False, (f"{len(alts)} mates in {remaining} "
                                   f"({', '.join(board.san(a) for a in alts)})")
            board.push(mv)

        # the defense is free to vary, but every defense must run into the same
        # mating picture — otherwise the card teaches a pattern it doesn't always reach
        pictures, impure = set(), set()
        _pictures(front, (len(solution) + 1) // 2, budget, memo, pictures,
                  impure, PURE.get(THEME))
    except OverBudget:
        return False, f"mate search too deep (over {MATE_NODES} nodes)"
    if len(pictures) > 1:
        shown = "; ".join(f"K{sq} by {'/'.join(chess.piece_name(t) for t in ts)}"
                          for sq, ts in sorted(pictures))
        return False, f"{len(pictures)} different mates depending on the defense ({shown})"
    if impure:
        return False, f"not a pure {THEME}: {'; '.join(sorted(impure))}"
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
    # the recorded mate is checked first: an impure one costs nothing to spot,
    # and the exhaustive search below is what is expensive
    pure = PURE.get(THEME)
    if pure:
        end = board.copy()
        for mv in line[1:]:
            end.push(mv)
        why = pure(end)
        if why:
            print(f"reject {row['PuzzleId']}: not a pure {THEME}: {why}", file=sys.stderr)
            return None
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
