// A display name as it is stored. Names are public (a review is signed with
// one) and unique, so two that look the same must be the same string: no
// characters that do not show, one space where there is any run of white
// space, none at the ends, and compatibility forms (full-width letters, say)
// folded to the plain ones.
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}ᅟᅠ⠀ㅤﾠ]/gu;

const cleanName = name =>
	(name ?? "").toString()
		.normalize("NFKC")
		.replace(INVISIBLE, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 100);

export { cleanName }
