# Deck: Checkmate with King + Queen vs King

Flashcard practices used:
- **Atomic cards** — one idea, one decision, or one position each.
- **Active recall** — every front is a question or a "find the move" board, never a passage to reread.
- **Backward chaining** — mates-in-1 first, then mate-in-2, then technique from open positions; each stage reuses the previous stage's patterns.
- **Failure modes as first-class cards** — the stalemate traps get their own cards, including one position where the mating move and the stalemating move sit next to each other.
- **Why on the back** — answers explain the principle, not just the move.

All positions and solutions verified with chess.js (mates are mates, the trap is a stalemate, mates-in-2 are forced).

## Stage 0 — Concepts

**1. The plan**
- Front: What is the 4-step plan to mate with K+Q vs K?
- Back: 1) Box the king in with the queen. 2) Shrink the box. 3) Walk your king up next to the box. 4) Mate on the edge. The queen alone can never mate — the king must help.

**2. Where does the mate happen?**
- Front: On which squares can a lone king be mated by K+Q?
- Back: Only on the edge of the board. You cannot mate a king in the middle — driving it to any edge (corner not required) is always step one.

**3. The two mate patterns**
- Front: Name the two mate patterns of K+Q vs K.
- Back: **Support mate** — queen stands on the square directly in front of the edge-bound king, protected by her own king. **Line mate** — queen takes the whole edge rank/file from a distance while your king covers the escape squares.

**4. The box method**
- Front: While shrinking the box, what distance does the queen keep from the enemy king, and why?
- Back: A knight's move away. From there she fences the king in on two sides at once; when the king steps, she steps to knight's distance again and the box shrinks by itself — no checks needed.

**5. The corner caveat**
- Front: When must you STOP keeping the queen a knight's move from the king?
- Back: When the king reaches the corner. Knight's distance from a cornered king (e.g. Kh8, Qg6) is stalemate. Once the king is on the edge, park the queen two files/ranks away and bring your king in.

**6. No rush**
- Front: Worst case, how many moves does K+Q vs K take with correct play — and what follows from that?
- Back: 10 moves. The 50-move rule is never a threat, so never grab a "fast" check that risks stalemate — slow and boxed wins.

## Stage 1 — Mate in 1

**7. Support mate**
- Front: board `4k3/1Q6/4K3/8/8/8/8/8 w - - 0 1` + "White mates in 1."
- Back: board with move **Qe7#**. Queen in front of the king, defended by yours — the support mate.

**8. Corner support mate**
- Front: board `7k/1Q6/6K1/8/8/8/8/8 w - - 0 1` + "White mates in 1."
- Back: board with move **Qh7#**. Same support mate in the corner.

**9. Line mate**
- Front: board `6k1/8/6K1/8/8/8/8/3Q4 w - - 0 1` + "White mates in 1."
- Back: board with move **Qd8#**. Queen owns the back rank from afar; your king covers f7/g7/h7. No support needed.

**10. Mate or stalemate — one square apart**
- Front: board `7k/8/5K2/6Q1/8/8/8/8 w - - 0 1` + "One queen move mates, another draws on the spot. Find both."
- Back: board with move **Qg7#** (support mate). **Qg6??** is stalemate — that's the knight's-distance trap from card 5. The difference is one square.

## Stage 2 — Mate in 2

**11. The king must step in**
- Front: board `7k/8/5K2/8/8/8/8/1Q6 w - - 0 1` + "White mates in 2. The first move is not a queen move."
- Back: board with moves **Kg6 Kg8, Qb8#** (line mate; ...Kg8 is forced). The queen was already close enough — the missing piece was your king.

**12. Quiet queen move first**
- Front: board `4k3/8/3QK3/8/8/8/8/8 w - - 0 1` + "White mates in 2."
- Back: board with moves **Qc7 Kf8, Qf7#**. Qc7 takes every square the king needs without check; the reply is forced and the support mate follows.

## Stage 3 — Technique

**13. Start the box**
- Front: board `8/8/8/3k4/7Q/8/8/4K3 w - - 0 1` + "No checks: what's the boxing move?"
- Back: board with move **Qf4** — knight's distance from d5. The king is fenced behind rank 4 and the f-file; repeat knight's distance as it moves, then card 11's king walk finishes.

## Card-type note

Board cards (7–13) fit the "comes back only if wrong" tactic-card type from deck-ideas. Concept cards (1–6) are normal spaced-repetition cards.
