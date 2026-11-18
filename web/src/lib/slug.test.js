import { describe, it, expect } from "vitest"
import { slugify } from "./slug.js"

describe("a marketplace deck name's slug", () => {
	it("lowercase words joined by -, apostrophes dropped", () => {
		expect(slugify("L'Ami's Caro-Kann")).toBe("lamis-caro-kann");
		expect(slugify("Short & Sweet: Colovic’s Najdorf Sicilian")).toBe("short-sweet-colovics-najdorf-sicilian");
		expect(slugify("  1.e4 for Black?! ")).toBe("1-e4-for-black");
	});

	it("names that differ only in case, spacing or punctuation share one", () => {
		expect(new Set(["Caro-Kann", "caro kann", "CARO  KANN!"].map(slugify))).toEqual(new Set(["caro-kann"]));
	});

	it("accents dropped, letters without one spelled out, other scripts kept", () => {
		expect(slugify("Réti Opening")).toBe("reti-opening");
		expect(slugify("Åbningsspil for Ørsted")).toBe("abningsspil-for-orsted");
		expect(slugify("Straße")).toBe("strasse");
		expect(slugify("国际象棋 开局")).toBe("国际象棋-开局");
	});

	it("empty without a letter or digit", () => {
		expect(slugify("?!? ...")).toBe("");
	});
});
