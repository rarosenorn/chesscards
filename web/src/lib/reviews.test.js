import { describe, it, expect } from "vitest"
import { reviewSummary } from "./reviews.js"

describe("a deck's review summary", () => {
	it("is nothing without reviews", () => {
		expect(reviewSummary({ reviewCount: 0, recommendCount: 0 })).toBe(null)
	})

	it("is only the count below ten reviews", () => {
		expect(reviewSummary({ reviewCount: 1, recommendCount: 1 })).toBe("1 review")
		expect(reviewSummary({ reviewCount: 9, recommendCount: 2 })).toBe("9 reviews")
	})

	it("is the share that recommend from ten reviews up", () => {
		expect(reviewSummary({ reviewCount: 10, recommendCount: 9 })).toBe("90% recommend (10)")
		expect(reviewSummary({ reviewCount: 38, recommendCount: 35 })).toBe("92% recommend (38)")
	})
})
