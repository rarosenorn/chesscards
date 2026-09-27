import { Arrows } from "cm-chessboard/src/extensions/arrows/Arrows.js"
import { Svg } from "cm-chessboard/src/lib/Svg.js"

// cm-chessboard's arrows, with the answer's told apart from the question's: on
// a board showing its back layer (chessboard.backArrows, set by
// showAnnotations) every arrow carries a small dark dot just short of its
// head. The arrow types stay the stock ones, so the right-click annotator
// still finds and removes these arrows as its own.
export class LayeredArrows extends Arrows {
	drawArrow(arrow) {
		super.drawArrow(arrow);
		if (!this.chessboard.backArrows) return;
		const group = this.arrowGroup.lastChild;
		const line = group?.querySelector("line");
		if (!line) return;
		const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map(a => parseFloat(line.getAttribute(a)));
		const width = parseFloat(line.getAttribute("stroke-width"));
		const length = Math.hypot(x2 - x1, y2 - y1) || 1;
		// the head's base sits on the line's end; the dot stops a little
		// short of it, inside the shaft
		const back = Math.min(width * 0.8, length / 2);
		Svg.addElement(group, "circle", {
			cx: x2 - (x2 - x1) / length * back,
			cy: y2 - (y2 - y1) / length * back,
			r: width * 0.3,
			class: "arrow-back-dot"
		});
	}
}
