import { generateText } from "@tiptap/core"
import { generateHTML } from "@tiptap/html"
import Document from "@tiptap/extension-document"
import Text from "@tiptap/extension-text"
import Paragraph from "@tiptap/extension-paragraph"
import HardBreak from "@tiptap/extension-hard-break"
import Bold from "@tiptap/extension-bold"
import Italic from "@tiptap/extension-italic"
import { BulletList, OrderedList, ListItem } from "@tiptap/extension-list"

const generateExtensions = [Document, Paragraph, HardBreak, Text, Bold, Italic, OrderedList, BulletList, ListItem
]
const ttGenerateHTML =  JSONdoc => {
	return generateHTML(JSONdoc, generateExtensions);
}

const ttGenerateText = JSONdoc => {
	return generateText(JSONdoc, generateExtensions);
}

export { ttGenerateHTML, ttGenerateText }
