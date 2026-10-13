import { Node, textblockTypeInputRule } from "@tiptap/core"

// The headings of an intro page: two levels, under the page's own title —
// which is the h1, so level 1 is written as an h2 and level 2 as an h3.
// "# " and "## " at the start of a line make them, as the buttons do.
// Only the intro editor carries this node; a card's text has no headings.
const LEVELS = [1, 2];

export const Heading = Node.create({
	name: "heading",
	content: "inline*",
	group: "block",
	defining: true,

	addAttributes() {
		return { level: { default: 1, rendered: false } };
	},

	parseHTML() {
		return LEVELS.map(level => ({ tag: `h${level + 1}`, attrs: { level } }));
	},

	// The level is read from stored content, which the server takes as it is
	// sent: anything but a level there is, is the first. It names the tag, and
	// the server's renderer writes a tag name out as it is given.
	renderHTML({ node, HTMLAttributes }) {
		const level = LEVELS.includes(node.attrs.level) ? node.attrs.level : LEVELS[0];
		return [`h${level + 1}`, HTMLAttributes, 0];
	},

	addCommands() {
		return {
			toggleHeading: attributes => ({ commands }) =>
				commands.toggleNode(this.name, "paragraph", attributes)
		};
	},

	addInputRules() {
		return LEVELS.map(level => textblockTypeInputRule({
			find: new RegExp(`^(#{${level}})\\s$`),
			type: this.type,
			getAttributes: { level }
		}));
	}
});
