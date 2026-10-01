# Currently working on
- center Show duplicates text on input and increase font size slightly

## others
- interactive puzzle cards / boards
- Since there are many settings, maybe once they become relevant show popup so user can read and make decision. e.g. for chapters first time they hit chapter limit explain why chapters and let them decide the config. Same with: study ahead 20 min incl. explanation,
- ?allow images in flashcard for e.g. easily inserting image of your blunder instead of copying fen and creating board and inserting fen?

## Personalized blunder and mistake cards
- Would be cool to have a feature that imports mistakes and blunders from your own game and creates a flashcard from it into your blunder deck with explanation why your move was bad and what the best move is and why. make it automatic like lichess game analysis extension to analyze your game, find bad moves, make flashcard from it with explanation
- Worth it as a feature for existing users: mistakes land in a dedicated "My blunders and mistakes" deck, in the same app and review queue as their openings. Not a differentiator on its own — Blunder Tutor, PatternChess and chess_trainer already do mistakes + spaced repetition + explanation (see chess-tools.md).
- Engine finds the mistakes and best line; AI only explains from the engine output. Filter to mistakes findable at the user's level, 2-3 per game, user picks which to keep.
- Later: also card your good finds (chess.com's great / brilliant). Great = you played the only move that holds the eval (needs the engine's top two moves); brilliant = that plus a material sacrifice. Front "find the move you played here", back explains why it works; same deck, tagged as a good find.
- Later, business model: one-time credit packs, not a subscription (see FAQ). Importing a game with engine lines only stays free up to a daily cap (analysis runs on our server); the AI explanation is the paid part, since it is the only thing with a real cost per use (measured at roughly 12-16¢ a game on Opus 5.5). Pack price to be set against that ($5 for 25 games would be too thin); first few free.

## subdecks
- Order could be subdeck.number? like if a card is the 3rd card in the 2nd subdeck its order is 2.3?
- Subdecks are parts of a deck grouped together for some level of internalization before moving to next subdeck
- level of internalizatoin before moving on? maybe having seen all cards in subdeck atleast 3 times?, then its not dependents on getting them right, or maybe getting synthesis cards correct 2 times?
- Subdecks because sometimes its good to have some mastery of part of a deck, before moving to the next part. For example, in endgames its better to have seen cards from basic endgames like king and rook vs king multiple times and have some mastery of that part, before moving to include cards from the next subdeck, which could include more advanced endgames. Then you would progress when you hit target on some variable in the previous subdeck. Ofcourse it should have settings to bypass in whatever way.

Subdecks is good because if you have a large deck on 1 opening for example, its better to gain some mastery of the most popular lines and not too deep (like quickstart in chessable), rather than getting cards for the basics and then more obscure before you even have a level of internalization of the basics. Same for endgames, want to master basics before knight and bishop mate.

# Study features:
## Setting on customizing fsrs (also somehow see personal optimization)

## restart deck (delete all progress of deck and do such that its a fresh deck from fsrs perspective)

## Cram mode
Study all cards in the chosen deck by getting cards from the deck contiuously. How can we do it? 
   - Look at Brainscape model for still evaluating and getting cards based on their relative "Mastery"
   - Getting all cards in order (cards that are due are still evaluated and count towards fsrs, cards that are not due just have "next" and doesnt do anything towards fsrs. Then just get them in order continuously
   - Maybe look at how others do them

## Metadecks
- Metadecks because sometimes you want to study more than one deck at the same time (ties into interleaving different but related subjects). For example if i want to study a deck on basic endgames together with a seperate deck on intermediate endgames. (should still adhere to subdeck progression)

## study all button
- Button for study all, which studies all your decks in some way for interleaving all, still adhering to subdeck progression.

# when in edit mode, arrows cant both go back and forth in moves and control caret. what to do?
# footer for proffesional look
# contact page with email for bugs / ideas / business inquiries
# allow PGN for board editor for both positions and moves import
# editor: do selectors for annotations like pieces with nice icons showing arrows and circle, selectable and between Start position Clean board and pieces above
# maybe: editor toggle for side to move (click the indicator to flip it) — only way now is editing the w/b in the FEN field
# Chesscards wiki with info on how app works, FSRS, card types etc.
# Do so if i card becomes due during a day, it becomes due at 2am local time, s.t. cards are rdy in the morning instead of dumping in through the day.(look how anki does)
# Overview over your decks on marketplace / how many got/purchased it stats
# Versioning of marketplace decks? If you improve it, request to update?
# Statistics
# if its your deck, do such that if you press e in study mode the editor comes up and youcan change stuff
# evaluation of deck: dont do stars theyre reductive. do recommend / do not recommend like steam and do comments with upvote / downvote buttons.
# heatmap in myflashcards like anki heatmap and github heatmap

# Chessboard editor
# "fork" free deck?
# link created account with socials, delink created account from socials

# REST OF DOC AI CREATED
# SPEC: add-cards editor — caret / deletion / merge behavior
As implemented in `web/src/lib/tiptap-chessboard-block/` (2026-07-28). This is
the reference for how the editor is SUPPOSED to behave — adjust this first,
then make the code match.

## Model
- Each card side is a tiptap document; a chessboard block is ONE atom node
  holding a boards array, laid out 2 per row. Text lines live around blocks.
- The virtual board caret sits at gap indices inside one block (0 = before the
  first board … boards.length = after the last). It renders as a bar 5px off
  the board face, spanning board + FEN bar (never the number above or the
  move line below), ~1.5px thick snapped to device pixels.
- Horizontal navigation walks VISUAL stops (screen order, from DOM geometry):
  each visual row contributes a "down" stop before its first board and an
  "up" stop after every board; a same-row middle gap is a single stop. A row
  break (2-wide wrap, or an open editor taking a full row) gives one gap two
  stops picked by affinity, like a text line wrap.

## Caret
- Clicking a board parks the caret at its right. Shift+click extends a range;
  dragging from the grid's empty space sweep-selects; shift+arrows likewise.
- Opening a board editor (Edit button or insert): the document keeps focus and
  the caret parks at the board's right — the editor-right stop EXISTS for
  navigation but never renders a bar. The editor's left renders like any
  board; the board below keeps its own left stop.
- The selection tint covers board + bar exactly and bridges the gap between
  two same-row selected boards. Plain arrows collapse a range to its edge.
- While the caret is active, board move-nav (arrows) is off; inside a board
  editor's moves mode the move recorder claims arrows first.
- Focus never leaves the document for board presses, editor clicks on
  non-text controls, or drags (the dnd library's focus steal is reverted);
  the caret follows a dropped board.

## Enter / typing at a gap
- Enter before the first board: a line pushes in above, caret stays.
- Enter mid-block: the block splits, text caret lands on the line between.
- Enter after the last board: a line below, text caret in it.
- Typing a character makes the line the keystroke would have made (above /
  split / below) carrying the character.

## Deletion
- In-block Backspace/Delete removes the nearest board (or the active range).
  A block emptied of boards dissolves into an empty line.
- At a block edge: an empty neighboring line joins away (caret flows into the
  block); a text line takes the caret; an adjacent block flows the caret
  through.
- From text beside a block: an empty line joins away; a non-empty line
  deletes the block's nearest board and the text caret stays. At the document
  edge with a block on the other side, the key is consumed — never left to
  the browser's native delete, which selects the whole island.
- Every deletion reparks the real selection collapsed (gap cursor when
  possible) so remapping can never tint blocks as selected.

## Merge (normalizer)
- Two blocks left adjacent — the line between them deleted by any means —
  merge into one. The first block's id survives; the caret remaps into the
  merged block. The normalizer also dissolves empty blocks and assigns ids to
  blocks born without one (paste).

## Clipboard
- Mod-c/x/v with the caret active: the board clipboard, within and across
  blocks and sides. Pasting with a text caret joins a block that touches it
  (nothing but the line boundary between), else creates a new block at the
  caret's line. Native paste of block HTML regenerates all ids.
