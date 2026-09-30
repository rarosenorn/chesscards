import { Arrows } from "cm-chessboard/src/extensions/arrows/Arrows.js"
import { Svg } from "cm-chessboard/src/lib/Svg.js"
import { arrowKey, arrowKeyFromType } from "$lib/board-utils.js"

// cm-chessboard's arrows, with the answer's told apart from the question's:
// an arrow only the back layer has (chessboard.backArrowKeys, set by
// showAnnotations) carries a small dark dot just short of its head. The arrow types stay the stock ones, so the right-click annotator
// still finds and removes these arrows as its own.
export class LayeredArrows extends Arrows {
	drawArrow(arrow) {
		super.drawArrow(arrow);
		const key = arrowKey({ type: arrowKeyFromType(arrow.type), from: arrow.from, to: arrow.to });
		if (!this.chessboard.backArrowKeys?.has(key)) return;
		const group = this.arrowGroup.lastChild;
		const line = group?.querySelector("line");
		if (!line) return;
		const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map(a => parseFloat(line.getAttribute(a)));
		const width = parseFloat(line.getAttribute("stroke-width"));
		const length = Math.hypot(x2 - x1, y2 - y1) || 1;
		// the head's base shows about 0.8 widths short of the line's end; the
		// dot's edge touches it, so the whole dot sits in the shaft
		const r = width * 0.3;
		const back = Math.min(width * 0.8 + r, length / 2);
		Svg.addElement(group, "circle", {
			cx: x2 - (x2 - x1) / length * back,
			cy: y2 - (y2 - y1) / length * back,
			r,
			class: "arrow-back-dot"
		});
	}
}
