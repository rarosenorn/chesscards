# Currently working on
## add cards page
- when clicking on an open editor, the input becomes unfocused, it should still be focused.
- in study and browse, flashcard text and boards should have same margin, e.g. left side of text and left side of left board (when 2 boards in row) should be flush
- but the caret should only be ihdden on editor right side, not on next boards left side, in regards to what we just fixed.

## do so if you own a deck and are in study mode, you can press e and you can edit the card like in browse. put edit button on right side of answers (mirror hide button) but only if user owns deck ofcourse

## indicator whos turn it is on a board, like in 1001 endgame puzzles with a color filled square

## subdecks
- Subdecks are parts of a deck grouped together for some level of internalization before moving to next subdeck
- Subdecks because sometimes its good to have some mastery of part of a deck, before moving to the next part. For example, in endgames its better to have seen cards from basic endgames like king and rook vs king multiple times and have some mastery of that part, before moving to include cards from the next subdeck, which could include more advanced endgames. Then you would progress when you hit target on some variable in the previous subdeck. Ofcourse it should have settings to bypass in whatever way.

Subdecks is good because if you have a large deck on 1 opening for example, its better to gain some mastery of the most popular lines and not too deep (like quickstart in chessable), rather than getting cards for the basics and then more obscure before you even have a level of internalization of the basics. Same for endgames, want to master basics before knight and bishop mate.

## Card position in the deck, default insertion order, but rearrangable

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

# allow PGN for board editor for both positions and moves import
# editor: make the drag and drop work properly again, AI didnt revert properly so I think we lost some function, esp. between back and front
# editor: do selectors for annotations like pieces with nice icons showing arrows and circle, selectable and between Start position Clean board and pieces above
# editor: another delete block icon thats not ugly
# Chesscards wiki with info on FSRS, card types etc.
# Tutorial page on how to use editor
# Reorder cards in deck builder, so you can decide which order the cards are, different from insertion order
# Do so if i card becomes due during a day, it becomes due at 2am local time, s.t. cards are rdy in the morning instead of dumping in through the day.(look how anki does)
# Overview over your decks on marketplace / how many got/purchased it stats
# Versioning of marketplace decks? If you improve it, request to update?
# Statistics
# if its your deck, do such that if you press e in study mode the editor comes up and youcan change stuff
# evaluation of deck: dont do stars theyre reductive. do recommend / do not recommend like steam.
## heatmap in myflashcards like anki heatmap and github heatmap
## more detailed statistics?

# Chessboard editor
# Card types
Different card types than just front and back, like anki has different types like cloze deletion, image mask etc.
## tactics card type
Card type that is done first time you get it correct, again if not correct. For example for checkmate patterns, there are N tactics cards for "find checkmate and name pattern", doesnt make sense to have these kind of cards as fsrs, since its better to have more different, than seeing same "puzzle" multiple times"
## cloze deletion

# "fork" free deck?
# link created account with socials, delink created account from socials

## board editor: delimit front/back moves in the move list
Show ALL moves in the editor's move list at all times (no hiding behind the
eye), with some UI delimiting where the back begins — e.g. a divider line /
"back" label between the front segment and the back segment. The eye then
only governs the board preview, and the boundary is always visible while
editing.

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
