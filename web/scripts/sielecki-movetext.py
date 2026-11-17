"""Quickstart move text for the two Sielecki decks.

Each Quickstart line card gets, as the last paragraph of its back, its own
line as move text with the same chapter's other Quickstart lines in parens
where they leave it (nested as in PGN). Side lines are [move refs], so they
play on the card's board; the card's own moves are prose (the board's move
line plays them). Course marks (! ? ?! ??) come from the cards' fronts and
backs. Rerunnable: an earlier generated paragraph is replaced.

    python3 web/scripts/sielecki-movetext.py        # from the repo root; writes the specs
"""
import json
import re
import sys

SPECS = ["specs/sielecki-manual.json", "specs/sielecki-black-manual.json"]
START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
MARKED = re.compile(r"(\d+)(\.\.\.|\.)([A-Za-z][A-Za-z0-9+#=-]*?)([!?]+)(?=[\s,.;:)]|$)")
GENERATED = re.compile(r"^1\.\S")


def group_of(card_id):
    if card_id.startswith("qs-tr-"):
        return "tarrasch"
    prefix = card_id.split("-ov")[0]
    return "pirc-modern" if prefix in ("pc", "md") else prefix


def number(ply):
    return f"{ply // 2 + 1}{'.' if ply % 2 == 0 else '…'}"


def marks_of(card, line):
    back = card["back"] if isinstance(card["back"], str) else card["back"].get("text", "")
    # not from an earlier run's own paragraph: its side lines carry other lines' marks
    paragraphs = back.rstrip().split("\n\n")
    if GENERATED.match(paragraphs[-1]):
        back = "\n\n".join(paragraphs[:-1])
    found = {}
    for match in MARKED.finditer(card["front"]["text"] + "\n" + back):
        ply = (int(match.group(1)) - 1) * 2 + (1 if match.group(2) == "..." else 0)
        if ply < len(line) and line[ply] == match.group(3):
            found[tuple(line[: ply + 1])] = match.group(4)
    return found


def movetext(main, lines, marks):
    """main: the card's line; lines: the chapter's lines in deck order."""

    def label(path, ply, first):
        san = path[ply] + marks.get(tuple(path[: ply + 1]), "")
        return f"{number(ply)}{san}" if first or ply % 2 == 0 else san

    def continuations(prefix):
        # the chapter's lines through prefix, each first move once, deck order
        seen, out = set(), []
        for line in lines:
            if len(line) > len(prefix) and line[: len(prefix)] == prefix and line[len(prefix)] not in seen:
                seen.add(line[len(prefix)])
                out.append(line)
        return out

    def variation(line, branch, root=None):
        # line leaves its parent at ply `branch` and the card's line at `root`;
        # written as refs split at marks and at nested variations, each ref
        # replaying (unwritten) the moves since the card's line
        root = branch if root is None else root
        parts, segment, start, ply = [], [], branch, branch
        first = True

        def flush(end_ply):
            nonlocal segment, start
            if not segment:
                return
            lead = " ".join(label(line, p, p == root) for p in range(root, start))
            written = " ".join(segment)
            parts.append(f"[{lead} | {written}]" if lead else f"[{written}]")
            segment, start = [], end_ply

        while ply < len(line):
            segment.append(plain(line, ply, first or ply == start))
            mark = marks.get(tuple(line[: ply + 1]), "")
            nested = [other for other in continuations(line[:ply]) if other[ply] != line[ply]] if ply > branch else []
            if mark or nested:
                flush(ply + 1)
                if mark:
                    parts[-1] += mark
                for other in nested:
                    parts.append("(" + variation(other, ply, root) + ")")
            first = False
            ply += 1
            if (mark or nested) and ply < len(line):
                first = True
        flush(len(line))
        return " ".join(parts)

    def plain(path, ply, first):
        return f"{number(ply)}{path[ply]}" if first or ply % 2 == 0 else path[ply]

    words, after_variation = [], False
    for ply in range(len(main)):
        words.append(label(main, ply, ply == 0 or after_variation))
        after_variation = False
        for other in continuations(main[:ply]):
            if other[ply] != main[ply]:
                words.append("(" + variation(other, ply) + ")")
                after_variation = True
    return " ".join(words)


def run(path):
    spec = json.load(open(path))
    cards = [c for c in spec["chapters"][0]["cards"] if "front" in c and c["front"].get("boards")]
    groups = {}
    for card in cards:
        board = card["front"]["boards"][0]
        assert board["fen"] == START, card["id"]
        groups.setdefault(group_of(card["id"]), []).append(card)
    changed = 0
    for group in groups.values():
        lines = [c["front"]["boards"][0]["moves"] for c in group]
        marks = {}
        for card, line in zip(group, lines):
            marks.update(marks_of(card, line))
        for card, line in zip(group, lines):
            assert isinstance(card["back"], str), card["id"]
            paragraphs = card["back"].rstrip().split("\n\n")
            if GENERATED.match(paragraphs[-1]):
                paragraphs.pop()
            if len(group) > 1:
                paragraphs.append(movetext(line, lines, marks))
            back = "\n\n".join(paragraphs)
            if back != card["back"]:
                card["back"] = back
                changed += 1
    with open(path, "w") as out:
        json.dump(spec, out, ensure_ascii=False, indent=2)
        out.write("\n")
    return changed


if __name__ == "__main__":
    for spec in SPECS:
        print(spec, run(spec), "backs changed", file=sys.stderr)
