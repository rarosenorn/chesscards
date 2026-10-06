import { describe, it, expect } from "vitest"
import { cleanName } from "./display-name.js"

describe("a display name as stored", () => {
	it("is left alone when it is plain", () => {
		expect(cleanName("anna_k")).toBe("anna_k")
		expect(cleanName("Søren Ærø")).toBe("Søren Ærø")
	})

	it("loses the white space that would make it look like another's", () => {
		expect(cleanName("  pawnstorm ")).toBe("pawnstorm")
		expect(cleanName("endgame \t  erik")).toBe("endgame erik")
		expect(cleanName("endgame erik")).toBe("endgame erik")
	})

	it("loses characters that do not show", () => {
		expect(cleanName("pawnstorm​")).toBe("pawnstorm")
		expect(cleanName("pawn‍storm⁠")).toBe("pawnstorm")
		expect(cleanName("ㅤ")).toBe("")
	})

	it("folds compatibility forms to the plain letters", () => {
		expect(cleanName("ｊｏｎａｓ")).toBe("jonas")
	})

	it("is at most 100 characters", () => {
		expect(cleanName("a".repeat(150))).toHaveLength(100)
	})
})
