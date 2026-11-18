const LETTERS = { "ø": "o", "æ": "ae", "œ": "oe", "ß": "ss", "đ": "d", "ł": "l", "þ": "th", "ı": "i" };

// A marketplace deck's name as its URL has it. Two names with the same slug
// count as the same name. Empty when the name has no letter or digit.
export const slugify = name => name
	.toLowerCase()
	.normalize("NFKD")
	.replace(/\p{M}/gu, "")
	.replace(/[øæœßđłþı]/g, letter => LETTERS[letter])
	.replace(/['’ʼ]/g, "")
	.replace(/[^\p{L}\p{N}]+/gu, "-")
	.replace(/^-+|-+$/g, "");

// the marketplace's own pages beside the decks'
export const RESERVED_SLUGS = ["checkout-complete"];
