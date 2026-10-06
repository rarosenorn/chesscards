// A deck's reviews as one line, for its header and its marketplace tile.
//
// Steam's rule: below ten reviews there is no score, only the count — one
// thumbs up would read as "100% recommend".
const SCORE_THRESHOLD = 10;

// null when the deck has no reviews
const reviewSummary = ({ reviewCount, recommendCount }) => {
	if (!reviewCount) return null;
	if (reviewCount < SCORE_THRESHOLD) return reviewCount === 1 ? "1 review" : `${reviewCount} reviews`;
	return `${Math.round(100 * recommendCount / reviewCount)}% recommend (${reviewCount})`;
}

export { reviewSummary }
