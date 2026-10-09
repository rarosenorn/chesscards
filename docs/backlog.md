# Things to test/check metadecks and subdecks
## Subdecks: Cards tab and Add cards
[ ] "+ Add subdeck" under the cards makes the deck's first subdeck (existing cards land in "Temp")
[ ] right-click a subdeck: rename, add subdeck inside, flatten subdecks, delete subdeck
[ ] drag a subdeck by its grip before / after / into another subdeck
[ ] drag cards between subdecks, also into an empty one
[ ] delete subdeck asks first and takes its subdecks and cards; deleting the last one makes the deck a plain list again
[ ] flatten subdecks (on a subdeck, and for the whole deck from the bottom row) asks first and keeps the cards in order
[ ] card numbers follow the path (2.3.17) and typing an order moves the card
[ ] Add cards: the subdeck picker shows the outline; a new subdeck can be made from it
[ ] subdeck names are trimmed and stop at 100 characters

## Subdecks: progression and study
[ ] deck Settings: Subdeck progression (None, 1 level, ..., All levels; Off / On with one level)
[ ] study follows it: new cards from locked subdecks do not come, and the "unlocks when ... passes" note names the subdeck
[ ] breadcrumb shows the subdeck path; long names are cut with an ellipsis and shown in full on hover
[ ] arrow after the breadcrumb on Study: switch between Whole deck and any subdeck (locks shown, current one bold)
[ ] the chosen subdeck is kept when going to Cards / Settings and back to Study, and forgotten when leaving the deck
[ ] switching subdeck while an answer is showing: the next card comes front up
[ ] an empty deck / subdeck says it has no cards instead of "Congratulations"

## Subdecks: My flashcards
[ ] a deck with subdecks opens with + / - level by level, and stays open after a reload
[ ] pressing just beside the + / - still opens or closes the row, and does not open the deck
[ ] nested rows look like the top-level ones (same weight and colour), only indented
[ ] each subdeck row has its own New / Learn / Due and a lock if locked
[ ] clicking a subdeck studies that subdeck on its own

## Subdecks: marketplace
[ ] approving an upload request copies the subdeck tree and the author's progression setting
[ ] Contents card on the marketplace deck page and on the Deck tab
[ ] a deck taken from the marketplace: own progression setting works, cards cannot be edited

## Metadecks: My flashcards
[ ] Metadecks is the last list and is there even when empty
[ ] "Create deck" and "Create metadeck", centred under the heatmap, each ask for a name in a dialog (Enter or Create makes it, Escape or Cancel leaves; stays on My flashcards)
[ ] a refused name (too short, already taken) is asked for again with the reason under the field
[ ] the "i" beside Metadecks explains what one is on hover
[ ] drag a deck, a marketplace deck or a metadeck onto a metadeck: it goes inside and stays in its own list
[ ] drag a row out of a metadeck: it is removed; drag it onto another metadeck: it moves
[ ] metadeck onto metadeck: middle of the row puts it inside, edges reorder; it cannot go inside itself
[ ] right-click a row: "Add to metadeck" and, inside a metadeck, "Remove from ..."
[ ] a metadeck's counts are the sum of its decks, each deck counted once
[ ] a metadeck opens with + / - onto its decks and metadecks, down to their subdecks
[ ] reorder decks, marketplace decks and metadecks by dragging still works

## Metadecks: study and settings
[ ] Mix: reviews shuffled together, new cards one from each deck in turn
[ ] In order: new cards deck by deck
[ ] In order, Due reviews: "From all decks first" (default) vs "Deck by deck"
[ ] each deck keeps its own subdeck progression inside a metadeck
[ ] marketplace cards in a metadeck have no Edit; own cards do
[ ] an empty metadeck says it holds no decks yet
[ ] Settings: rename, delete (its decks and their progress stay)
[ ] Cards tab: each deck is a heading with its subdecks and cards under it; search, sort and preview work
[ ] Cards tab is read-only (no edit, no drag, no right-click menu); "Open deck" goes to that deck's own Cards tab

## Other things changed on the way
[ ] deck and metadeck names: trimmed, 4 to 100 characters; a too-short or duplicate name reopens the create dialog with the reason
[ ] renaming a deck in Settings is validated the same way
[ ] a deck URL that is not a real id gives a 404
[ ] tab shortcuts (s / c / a / d / i) work right after clicking a checkbox or a pill
[ ] editing and deleting a card from Study and from Cards still work (their server code moved)

# Things to test/check cram mode
[ ] "Cram" button beside "Zen mode" on Study; the prompt asks for the order and "Answers count"
[ ] defaults are In order and ticked; the last choice is remembered; Enter starts, Escape cancels
[ ] works on a whole deck, on one subdeck (chosen from the breadcrumb) and on a metadeck
[ ] every card comes up, due or not, also from locked subdecks
[ ] In order follows the deck; Shuffled is random; By due date takes the soonest due first, then never-studied cards
[ ] with "Answers count": new, learning and due cards show Again / Hard / Good / Easy and are saved like normal study
[ ] with "Answers count": review cards not yet due show Again / Got it and the card is untouched (due date and reps unchanged)
[ ] without "Answers count": every card shows Again / Got it and no card is touched
[ ] practice answers (Again / Got it) still count in the activity heatmap for that day
[ ] Again brings the card back after about a minute, or straight away when nothing else is left
[ ] a new card stays in the session until it has graduated (comes back for its 10 minute step)
[ ] tactic cards: Incorrect / Correct when they count, Again / Got it when not
[ ] the counter reads "Cram · N left" and goes down as cards are got right
[ ] done screen "Cram finished: N cards" with "Go again"; "End cram" leaves at any time
[ ] keys: Space shows, 1 = Again, Space or 2 = Got it; 1-4 on counted cards
[ ] editing (e) and deleting (Delete) the card on screen work during a session
[ ] the session survives Cards / Settings and back, going to the marketplace or wiki and back, and a reload
[ ] a session from an earlier study day (before the rollover hour) is gone; one in progress as the hour passes carries on
[ ] switching to another subdeck leaves the session; switching back the same day resumes it
[ ] after cramming, normal study shows the right cards (those graded in cram are not asked again)
[ ] Zen mode works while cramming
[ ] while the Cram prompt (or any dialog) is open, Space / 1-4 and the tab shortcuts do nothing to the page behind

# Things to test/check heatmap
[ ] deleting a card removes its saved reviews from the heatmap (practice answers stay)

# Needed before launch
[ ] Landing page
[ ] why flashcards page
[ ] Wiki page better
[ ] db migrations
[ ] reporting reviews / decks
[ ] claude: Legal pages: terms of service, a privacy policy (GDPR), and a copyright and takedown policy. The last one matters because decks can be built from books and paid courses.
[ ] refunds by EU law
[ ] payment processing for buying decks
[ ] payment system for importing decks
[ ] paying authors of decks, what split etc.
[ ] better request upload to marketplace UI
[~] cram mode
[ ] how to handle updating marketplace deck with what people alrdy have, if it all? (versioning)
[ ] lichess, chess.com and google login / signup
[ ] claude api insteado f my own for importing bad moves from games
[~] subdecks and metadecks
[~] heatmap
[ ] responsive
[ ] phone app

# Currently working on

## check backend code correctness of
- Card fsrs logic
- payment logic
- deck / card ownership logic

## others
- maybe do puzzle type where you have to move for both Black and White? e.g. "what are the first 2 moves of Phillidor's Defense?"
- better prompt/popup design wise, e.g. confirm delete
- Since there are many settings, maybe once they become relevant show popup so user can read and make decision. e.g. for chapters first time they hit chapter limit explain why chapters and let them decide the config. Same with: study ahead 20 min incl. explanation,
- ?allow images in flashcard for e.g. easily inserting image of your blunder instead of copying fen and creating board and inserting fen?
- Live engine on the board: Stockfish running in the browser while you step through a card's position, like Lichess's local engine, with its settings (engine build, search time, multiple lines, threads, memory). Separate from the server analysis that makes blunder cards, which stays fixed at Lichess's setting.

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

## Subdecks and metadecks: the plan (agreed 2026-10-07, to build next)
The model:
- A deck holds cards. Inside it the author can make subdecks, nested to any depth (today's chapters, given a parent). They travel with the deck to the marketplace.
- A metadeck holds no cards: it is the owner's private grouping of decks and other metadecks, nested to any depth, for studying them mixed. A deck can be in several metadecks. No loops. A card reachable twice is studied and counted once.
- Progression depth replaces the on/off switch: 0 = mix everything, 1 = top-level subdecks unlock in order and mix inside, 2 = one level deeper, ... or all levels. The author sets the default; each studier can change it for their own copy.
- Unlock rule: down to the chosen depth, sibling subdecks open in order, each when the one before passes. A subdeck passes on today's rule (all seen, 80% graduated), counted over every card under it. Below the depth everything is open.
- Metadecks never gate, they only mix. Progression lives inside each deck.

Screens:
- My flashcards: decks with subdecks expand; each subdeck row has its own new / learn / review counts and a lock if locked; clicking one studies just that subdeck. Metadecks in their own section above, expanding the same way.
- Cards tab: the chapter bars become an indented, collapsible outline; drag a subdeck to reorder or nest it; drag cards between subdecks; numbers follow the path ("2.3.17").
- Add cards: the chapter picker becomes an indented picker of the outline.
- Deck settings: "Progression: None · 1 level · 2 levels · All", only as many levels as the deck has.
- Study: the unlock note names the locked subdeck by its path ("Rook endgames › Lucena").
- Metadeck page: Study (mixes everything under it) · Decks (a checklist of all decks and metadecks to tick in or out) · Settings (rename, delete). "New metadeck" beside "New deck".
- Marketplace deck page: a contents outline of the subdecks with card counts.

Build order, each step usable on its own:
1. Tree storage, depth setting and the unlock rule (lib/subdecks.js), with tests first.
2. Cards tab and the editor's picker handle the tree.
3. Depth control in settings; study follows it; study a single subdeck.
4. Expandable decks in My flashcards.
5. Marketplace: copy the tree on approval, studier's own depth, contents outline.
6. Metadecks.

Decided (2026-10-08):
- A subdeck holds either cards or subdecks, never both. Adding a subdeck inside something that has cards moves those cards into a first subdeck automatically (which can be renamed).
- Clicking a locked subdeck studies it.
- The interface says "subdeck" everywhere, in place of "chapter".
- A metadeck has a setting: "Mix" (the default) treats everything under it as one deck: reviews shuffled together, new cards taken one from each deck in rotation, each in its own order. "In order" finishes each deck's cards before the next, in the metadeck's own order.
- Inside a metadeck each deck's own subdeck progression still decides which of its new cards are unlocked.

Progress:
- [x] 1. Tree storage (subdecks.parent_id), progression depth (0 / n / null = every level) and the unlock rule with tests; approval copies the tree and the author's depth; a taken copy starts at that depth.
- [x] Renamed in the database, the code and the interface: stages / chapters are subdecks (tables `subdecks`, `marketplace_subdecks`; `cards.subdeck_id`; `decks.uses_subdecks`).
- [x] 2. Cards tab and editor: indented outline; add a subdeck inside another (right-click); drag a subdeck by its grip before, after or into another; delete takes its subdecks and cards (asks when there are cards); cards only go into subdecks that hold cards; numbers and typed orders follow the path; menus and pickers show the outline.
- [x] No "Use subdecks" setting: a deck is a plain list until its first subdeck is added ("+ Add subdeck" under the cards), and plain again when the last is deleted. The way back that keeps the cards is "Flatten subdecks": on a subdeck that holds subdecks (right-click) it takes away the subdecks inside and keeps their cards in it; at the bottom of the Cards tab it does so for the whole deck. Flattening and deleting a subdeck always ask first.
- [x] 3. Settings and study: the depth choice in Settings (None · 1 level · … · All levels; Off / On on a deck with one level), study follows it, the unlock note names subdecks by their path, and a subdeck can be studied on its own (study?subdeck=<id>; named in the breadcrumb, with the deck's name as the way back; long names there are cut with an ellipsis). On Study an arrow after the breadcrumb opens the deck's outline to switch between the whole deck and any subdeck; the choice is kept while the deck's other tabs are visited.
- [x] 4. My flashcards: a deck with subdecks opens (arrow, remembered per browser) to show them as an outline, each with its own counts and a lock if the deck has it locked; clicking one studies it on its own. A row's counts are what studying it would bring: the deck's follow its progression (new cards in locked subdecks are not counted), as Study's do.
- [x] 5. Marketplace: a Contents card on the deck's page and on the Deck tab (the outline of its subdecks, with how many cards sit under each); the taker's own depth setting works on their copy. (Fixed on the way: approving an upload request with a description failed.)
- [x] 6. Metadecks: listed in their own section at the bottom of My flashcards (always there, with its own create field under it), with the summed counts of the decks they come to (each deck once), opening onto what they hold, level by level, and reordered by dragging. They are filled there too: drag a deck, a marketplace deck or a metadeck onto a metadeck to put it inside (the deck stays in its own list), drag a row out of a metadeck to take it out, or onto another metadeck to move it; a right-click on a row offers the same ("Add to metadeck", "Remove from …"). A metadeck that would close a loop is not a target. A metadeck's pages: Study (the deck study page, each deck keeping its own progression; marketplace cards stay read-only) Cards (read-only: each deck a heading with its subdecks and cards under it, "Open deck" leading to that deck's own cards page) and Settings (rename, Mix / In order, delete: only the grouping goes). In order takes the new cards deck by deck; its due reviews come from all decks first unless set to go deck by deck too. Every metadeck is listed at the top level, also when another holds it.

# Study features:
## Setting on customizing fsrs (also somehow see personal optimization)

## restart deck (delete all progress of deck and do such that its a fresh deck from fsrs perspective)

## Cram mode
Need to figure out how cram mode should work before deciding if cram mode only available after completing due cards or always available
Study all cards in the chosen deck by getting cards from the deck contiuously. How can we do it? 
   - Look at Brainscape model for still evaluating and getting cards based on their relative "Mastery"
   - Getting all cards in order (cards that are due are still evaluated and count towards fsrs, cards that are not due just have "next" and doesnt do anything towards fsrs. Then just get them in order continuously
   - Maybe look at how others do them

Built 2026-10-08 (decided the Anki way):
- "Cram" at the bottom left of Study (always available) asks for the order (In order, Shuffled, By due date) and whether answers count; the last choice is remembered. It crams whatever Study is on: the deck, one subdeck, or a metadeck, every card, due or not, locked subdecks included.
- Answers count: new and learning cards always, review cards when due. Those get the four usual buttons and are saved and scheduled as in ordinary study. Everything else is practice: Again / Got it, the card untouched (the answer is only noted as study done that day, for the heatmap).
- Again brings the card back after a minute (a counted card at its own learning step), sooner when nothing else is left. A new card stays in the session until it graduates, as in an Anki filtered deck.
- Ends on "Cram finished" with "Go again"; "End cram" leaves at any time. The session is saved in the browser per deck / subdeck, so it survives the deck's other tabs, a break elsewhere on the site and a reload; it lasts the study day (until the rollover hour) and is then dropped. A session being studied as the hour passes carries on into the new day.

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
[y] evaluation of deck: dont do stars theyre reductive. do recommend / do not recommend like steam and do comments with upvote / downvote buttons.
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
