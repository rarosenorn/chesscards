import { ttGenerateText } from "./tiptap-utility.js"

// An article (a first exposure article) is a card read as a page, once,
// before the cards after it: its front is blocks of text and boards, with
// headings among the text (tiptap-heading.js), and it has no back.

// a contents list is worth having once a page has this many headings
const CONTENTS_FROM = 3;

// The page's headings in order, for its contents list: the ones that stand
// in the page's own text, not inside a list. One with no words in it is
// still counted (text ""), so a heading's place in this list is its place
// among the headings the page renders.
const articleHeadings = blocks => (blocks ?? [])
	.filter(block => block.type === "text")
	.flatMap(block => block.content?.content ?? [])
	.filter(node => node.type === "heading")
	.map(node => ({ level: node.attrs?.level === 2 ? 2 : 1, text: ttGenerateText({ type: "doc", content: [node] }).trim() }));

export { CONTENTS_FROM, articleHeadings }
