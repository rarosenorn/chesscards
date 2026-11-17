"""Quickstart alt lines for the two Sielecki decks.

Each Quickstart line card's back ends with the same chapter's other Quickstart
lines, as a "# Alt lines" paragraph and a numbered list in deck order: each
line named as its own card names it ("4...Bxf2+?! and 6...Ng6") and written
from the move where it leaves this card's line, as one [move ref] that plays
on the card's board: that line's trainer moves and nothing else. The card's
own line is not repeated: the board plays it. Rerunnable: the list an earlier
run wrote is replaced.

    python3 web/scripts/sielecki-movetext.py        # from the repo root; writes the specs
"""
import json
import re
import sys

SPECS = ["specs/sielecki-manual.json", "specs/sielecki-black-manual.json"]
START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
HEADING = "# Alt lines"
NAMED = re.compile(r"Play the (.+?) line(?: with (.+?))? from (?:White's )?(?:the )?first move")


def own_paragraphs(back):
    """The back without what an earlier run wrote."""
    paragraphs = back.rstrip().split("\n\n")
    if len(paragraphs) >= 2 and paragraphs[-2] == HEADING:
        return paragraphs[:-2]
    return paragraphs


def group_of(card_id):
    if card_id.startswith("qs-tr-"):
        return "tarrasch"
    prefix = card_id.split("-ov")[0]
    return "pirc-modern" if prefix in ("pc", "md") else prefix


def number(ply):
    return f"{ply // 2 + 1}{'.' if ply % 2 == 0 else '…'}"


def name_of(card):
    match = NAMED.search(card["front"]["text"])
    assert match, card["id"]
    return match.group(2) or match.group(1)


def alt_lines(main, others):
    """main: the card's line; others: [(name, line)] of the chapter's other
    lines in deck order. Each from the move where it leaves main."""
    items = []
    for name, line in others:
        leave = next((p for p in range(min(len(line), len(main))) if line[p] != main[p]), min(len(line), len(main)))
        if leave < len(line):
            moves = " ".join(f"{number(p)}{line[p]}" if p == leave or p % 2 == 0 else line[p] for p in range(leave, len(line)))
            items.append(f"{len(items) + 1}. {name}: [{moves}]")
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
        for index, (card, line) in enumerate(zip(group, lines)):
            assert isinstance(card["back"], str), card["id"]
            paragraphs = own_paragraphs(card["back"])
            others = [(names[i], lines[i]) for i in range(len(group)) if i != index]
            items = alt_lines(line, others)
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
