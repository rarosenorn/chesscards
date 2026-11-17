"""Quickstart alt lines for the two Sielecki decks.

Each Quickstart line card's back ends with the same chapter's other Quickstart
lines, as a "# Alt lines" paragraph and a numbered list in deck order: each
line named as its own card names it ("4...Bxf2+?! and 6...Ng6") and written
from the move where it leaves this card's line, as [move refs] that play on
the card's board. The card's own line is not repeated: the board plays it.
Course marks (! ? ?! ??) come from the cards' fronts and backs. Rerunnable:
what an earlier run wrote (this list, or the older move-text paragraph) is
replaced.

    python3 web/scripts/sielecki-movetext.py        # from the repo root; writes the specs
"""
import json
import re
import sys

SPECS = ["specs/sielecki-manual.json", "specs/sielecki-black-manual.json"]
START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
MARKED = re.compile(r"(\d+)(\.\.\.|\.)([A-Za-z][A-Za-z0-9+#=-]*?)([!?]+)(?=[\s,.;:)]|$)")
GENERATED = re.compile(r"^1\.\S")  # the older move-text paragraph
HEADING = "# Alt lines"
NAMED = re.compile(r"Play the (.+?) line(?: with (.+?))? from (?:White's )?(?:the )?first move")


def own_paragraphs(back):
    """The back without what an earlier run wrote."""
    paragraphs = back.rstrip().split("\n\n")
    if len(paragraphs) >= 2 and paragraphs[-2] == HEADING:
        return paragraphs[:-2]
    if paragraphs and (GENERATED.match(paragraphs[-1]) or paragraphs[-1] == HEADING):
        return paragraphs[:-1]
    return paragraphs


def group_of(card_id):
    if card_id.startswith("qs-tr-"):
        return "tarrasch"
    prefix = card_id.split("-ov")[0]
    return "pirc-modern" if prefix in ("pc", "md") else prefix


def number(ply):
    return f"{ply // 2 + 1}{'.' if ply % 2 == 0 else '…'}"


def marks_of(card, line):
    back = card["back"] if isinstance(card["back"], str) else card["back"].get("text", "")
    # not from what an earlier run wrote: its lines carry other lines' marks
    back = "\n\n".join(own_paragraphs(back))
    found = {}
    for match in MARKED.finditer(card["front"]["text"] + "\n" + back):
        ply = (int(match.group(1)) - 1) * 2 + (1 if match.group(2) == "..." else 0)
        if ply < len(line) and line[ply] == match.group(3):
            found[tuple(line[: ply + 1])] = match.group(4)
    return found


def name_of(card):
    match = NAMED.search(card["front"]["text"])
    assert match, card["id"]
    return match.group(2) or match.group(1)


def alt_lines(main, others, marks):
    """main: the card's line; others: [(name, line)] of the chapter's other
    lines in deck order."""

    def label(line, ply, first):
        return f"{number(ply)}{line[ply]}" if first or ply % 2 == 0 else line[ply]

    def refs(line, leave):
        # from ply `leave` on, split after each marked move (the mark goes
        # after its ref), each later ref replaying the moves before it unwritten
        parts, start = [], leave
        for ply in range(leave, len(line)):
            mark = marks.get(tuple(line[: ply + 1]), "")
            if mark or ply == len(line) - 1:
                lead = " ".join(label(line, p, p == leave) for p in range(leave, start))
                written = " ".join(label(line, p, p == start) for p in range(start, ply + 1))
                parts.append((f"[{lead} | {written}]" if lead else f"[{written}]") + mark)
                start = ply + 1
        return " ".join(parts)

    items = []
    for name, line in others:
        leave = next((p for p in range(min(len(line), len(main))) if line[p] != main[p]), min(len(line), len(main)))
        if leave < len(line):
            items.append(f"{len(items) + 1}. {name}: {refs(line, leave)}")
    return items


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
        names = [name_of(c) for c in group]
        marks = {}
        for card, line in zip(group, lines):
            marks.update(marks_of(card, line))
        for index, (card, line) in enumerate(zip(group, lines)):
            assert isinstance(card["back"], str), card["id"]
            paragraphs = own_paragraphs(card["back"])
            others = [(names[i], lines[i]) for i in range(len(group)) if i != index]
            items = alt_lines(line, others, marks)
            if items:
                paragraphs += [HEADING, "\n".join(items)]
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
