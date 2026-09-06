import { generateText } from "@tiptap/core"
import { generateHTML } from "@tiptap/html"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import Paragraph from "@tiptap/extension-paragraph"
import HardBreak from "@tiptap/extension-hard-break"
import Bold from "@tiptap/extension-bold"
import Italic from "@tiptap/extension-italic"
import { BulletList, OrderedList, ListItem } from "@tiptap/extension-list"
import { MoveRef } from "./tiptap-move-ref.js"

// MoveRef is here for the cards, not the editor: a move written in the text
// renders as its own span, which study and browse turn into a click on the
// board it names (see tiptap-move-ref.js).
const generateExtensions = [Document, Paragraph, HardBreak, Text, Bold, Italic, OrderedList, BulletList, ListItem, MoveRef
]
const ttGenerateHTML =  JSONdoc => {
	return generateHTML(JSONdoc, generateExtensions);
}

const ttGenerateText = JSONdoc => {
	return generateText(JSONdoc, generateExtensions);
}

export { ttGenerateHTML, ttGenerateText }
