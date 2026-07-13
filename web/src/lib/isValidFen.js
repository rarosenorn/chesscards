function isValidFen(fen) {
	const parts = fen.trim().split(/\s+/);
	if (parts.length !== 6) return false;

	const [board, turn, castling, enPassant, halfmove, fullmove] = parts;

	// 8 ranks, each describing exactly 8 squares
	const ranks = board.split("/");
	if (ranks.length !== 8) return false;
	for (const rank of ranks) {
		let squares = 0;
		for (const ch of rank) {
			if (ch >= "1" && ch <= "8") squares += Number(ch);
			else if ("prnbqkPRNBQK".includes(ch)) squares += 1;
			else return false;
		}
		if (squares !== 8) return false;
	}

	return /^[wb]$/.test(turn)
		&& /^(-|[KQkq]+)$/.test(castling)
		&& /^(-|[a-h][36])$/.test(enPassant)
		&& /^\d+$/.test(halfmove)
		&& /^\d+$/.test(fullmove);
}

export { isValidFen };
