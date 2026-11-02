# AI prompts
## double check for security, logic, edgecases
Can you look through this feature and double check if the logic is correct, the edgecasesare correctly handled and if there are any security issues. Its ok if there are none and everything is good, just double check. If there are any, loop through previous statement until there are none. Take your time, its important.

## Add checklist for me to test through for feature
Can you add checklist in backlog.md for me to test this implemented feature, incl. edgecases.

# Things to test/check
## Nested decks
### Your existing data (after the migration)
[ ] every deck that had subdecks has them as decks inside it, with the same cards, order and progress (due dates, reps)
[ ] a deck that had its subdecks switched off is one plain deck, its cards in the old order
[ ] the metadecks "current" and "Overviews" are decks; "current" is Mixed and holds the 4 decks it held
[ ] intros of the old subdecks are on the decks inside, and still show in study
[ ] the marketplace decks you took are in the list, at the end of the top

### My flashcards: the list
[ ] one list, headed "Deck": your decks and the marketplace decks you took, in one tree, looking alike (no marketplace mark)
[ ] a grey wheel at the end of every row that has a menu, always visible (no hover needed)
[ ] + / - opens a deck onto the decks inside it, level by level; stays open after a reload
[ ] a row's New / Learn / Due add up everything under it, also cards in locked decks
[ ] no lock symbols anywhere (list, Cards headers, Study's arrow menu); a locked deck still studies when clicked
[ ] "Create deck" asks for a name and makes a deck at the end of the top; a name you already have at the top is refused with the reason under the field
[ ] deck names: trimmed, 1 to 100 characters (a 1-letter name now works); the same name is fine in two different parents
[ ] no decks at all: "No decks yet. Create one, or take one from the marketplace."

### My flashcards: dragging
[ ] drag a deck onto the middle of another: it goes inside (the target lights up, ghost says "A → B") and that deck opens
[ ] drag to the top or bottom edge of a row: a line shows; it lands before / after that row at that row's level
[ ] just under an open deck that holds decks: it becomes the first deck inside it
[ ] between top-level rows: it comes out to the top level
[ ] below the last row: end of the top
[ ] a deck cannot go into itself or a deck inside it (nothing happens)
[ ] a marketplace deck can be dragged (in and out of your decks), but nothing can go inside one, and the decks inside it cannot be dragged
[ ] a name already used among the new siblings: "Could not move the deck" with the reason, nothing moves
[ ] a plain click on a row still opens its Study; Escape cancels a drag

### My flashcards: the wheel menu (and right-click, same menu)
[ ] your deck: New deck inside · Rename · Decks inside: In order / Mixed (only when it has decks inside, current one ticked) · Flatten (same) · Move to… · Delete
[ ] marketplace deck: Move to… · In order / Mixed (if it has decks inside) · Remove
[ ] a deck inside a marketplace deck: In order / Mixed if it has decks inside, else no wheel
[ ] New deck inside: named in a dialog, appears inside and the parent opens
[ ] Rename: field starts with the old name; a clash with a sibling is refused with the reason
[ ] Delete: a deck with no cards under it goes at once; with cards it asks first, naming the decks and cards that go
[ ] Delete a deck with a marketplace deck inside: the marketplace deck moves to the top of the list (the message says so)
[ ] Remove (marketplace deck): always asks; your progress on it goes; you can take it again from the marketplace
[ ] Flatten: asks first; the decks inside go, their cards land directly in the deck after its own, in order; a marketplace deck inside stays
[ ] Move to…: "Top of the list" or any of your decks except itself and what is inside it; Move moves it to the end there
[ ] menu closes on Escape and on a click elsewhere

### Study
[ ] studying a deck studies everything under it, incl. marketplace decks inside it
[ ] In order: the next deck inside opens only when the one before passes (all seen, 80% graduated); the deck's own cards count as the first
[ ] the "unlocks when ... passes" note names the deck by its path (or "the cards of X" when X's own cards hold it)
[ ] Mixed: all decks inside open; new cards come one from each in turn, each in its own order
[ ] a course In order inside a Mixed deck keeps its own order
[ ] reviews and learning cards always come, locked or not
[ ] breadcrumb: My flashcards -> outer deck › ... › this deck; each outer name opens its Study
[ ] arrow after the breadcrumb: the decks around and inside, the current one marked
[ ] marketplace cards have no Edit (e does nothing); your own cards inside the same deck do
[ ] cram on a deck covers everything under it; "Cram sessions completed today" counts per deck
[ ] an empty deck says "This deck has no cards yet."

### Cards tab
[ ] the deck's own cards first (numbered 1, 2, ...), then a header per deck inside (1.1, 2.3.17, ...)
[ ] headers collapse / expand, remembered while you visit the deck's other tabs
[ ] drag cards within a deck, to another deck inside, onto a header (to its front)
[ ] typing an order: "3" = third of the deck's own cards, "2.3" = third of the second deck inside; a marketplace deck's number is refused
[ ] right-click a card: Move to deck / Copy to deck list all your decks as an outline
[ ] marketplace cards (a marketplace deck inside yours): no drag handle, no type select, no right-click menu, no Edit, Delete key skips them
[ ] "Deck intro" at the bottom opens the deck's intro page
[ ] a marketplace deck's own Cards tab is read only

### Add cards and import from game
[ ] the Deck picker shows the deck and the decks inside it as an outline; marketplace decks inside are greyed out
[ ] the chosen deck is remembered per deck; a deck that has gone falls back to the deck itself
[ ] with no decks inside, no picker: cards go in the deck
[ ] Import from game: the same picker, cards land in the chosen deck

### Settings
[ ] rename (a clash with a sibling is refused)
[ ] "Decks inside": In order / Mixed, only when the deck has decks inside; on a marketplace deck it is your own choice
[ ] Reset deck resets every card under it, incl. marketplace decks inside, and brings its intro pages back
[ ] Delete deck deletes it with everything inside (a marketplace deck inside moves to the top)
[ ] a marketplace deck: "Remove deck" instead of Delete; a deck inside a marketplace deck: no delete/remove
[ ] Marketplace section: a deck with a marketplace deck inside says it cannot be shared

### Marketplace
[ ] any of your decks can be published (also one inside another); everything under it goes with it
[ ] the request-upload page refuses (back to Settings) a deck with a marketplace deck inside
[ ] admin review: card count, Browse and Intros cover the whole tree
[ ] after approval: the decks inside keep their order, names, intros and In order / Mixed; the deck's own cards stay its own
[ ] Contents card lists the decks inside with their card counts
[ ] taking a deck puts it at the end of the top of My flashcards; taking the same deck twice is refused

### Importer
[ ] a spec's chapters become decks inside the spec's deck; chapters of chapters go one deeper
[ ] a chapter can hold cards and chapters both; a top-level "cards" list fills the deck itself
[ ] re-running a spec changes nothing ("0 new, 0 updated")
[ ] a spec deck that now sits inside another deck (like Sielecki in "current") is still found by name

## Cram mode
[ ] fix card height in different modes and for different screen sizes, incl. when in zen / fs mode and hover at top to bring momentarily bars back
[ ] works on a deck with decks inside it and on a deck inside another (chosen from the breadcrumb)
[ ] every card comes up, due or not, also from locked decks
[ ] In order follows the deck; Shuffled is random; By due date takes the soonest due first, then never-studied cards
[ ] with "Answers count": new, learning and due cards show Again / Hard / Good / Easy and are saved like normal study
[ ] with "Answers count": review cards not yet due show Again / Ok and the card is untouched (due date and reps unchanged)
[ ] without "Answers count": every card shows Again / Ok and no card is touched
[ ] practice answers (Again / Ok) still count in the activity heatmap for that day
[ ] Again brings the card back after about a minute, or straight away when nothing else is left
[ ] every card comes up once: any answer but Again finishes it for the session and the counter drops, also for a new or learning card (its next step is left to normal study)
[ ] tactic cards: Incorrect / Correct when they count, Again / Ok when not
[ ] the counter reads "Cram session: y/x", card y of x: y (in the due green) is 1 on the first card and x on the last; it stays put after Again until that card is got right
[ ] done screen "Cram sessions completed today: n" (sessions finished on this deck today, kept on the account so it is the same on another device) with "Go again?", which asks for the order and "Answers count" again; "End cram" leaves at any time
[ ] keys: Space shows, 1 = Again, Space or 2 = Ok; 1-4 on counted cards
[ ] editing (e) and deleting (Delete) the card on screen work during a session
[ ] the session survives Cards / Settings and back, going to the marketplace or wiki and back, and a reload
[ ] a session from an earlier study day (before the rollover hour) is gone; one in progress as the hour passes carries on
[ ] switching to another deck (breadcrumb or arrow) leaves the session; switching back the same day resumes it
[ ] after cramming, normal study shows the right cards (those graded in cram are not asked again)
[ ] Zen mode works while cramming
[ ] while the Cram prompt (or any dialog) is open, Space / 1-4 and the tab shortcuts do nothing to the page behind

## Intro pages
### Writing an intro
[ ] Cards: "Deck intro" at the bottom opens the deck's intro page (a deck inside: open it and use its own Cards tab)
[ ] a page with no intro opens straight in the editor (Save only, no Cancel); one with an intro opens to read, with "Edit"
[ ] e opens the editor (not while typing in a field); Ctrl+Enter saves; Cancel drops the changes
[ ] H1 / H2 buttons in the editor bar (only on intro pages, not on cards or the deck description); text, bold/italic, boards and moves all work
[ ] saving a page with nothing on it removes the intro (shows "No intro")
[ ] a bad board (invalid FEN) shows an error under the editor and does not save; with the server stopped, "Could not save the intro..." shows
[ ] the names above the title lead to the outer pages (for the owner all of them, also ones with no intro yet); open the editor, click one: the other page loads, editor closed or open as that page needs
[ ] a reload after saving shows the saved page (headings included)
[ ] "Study" under a page goes to study of that deck
### Reading an intro
[ ] 3 or more headings: a contents list under the title, H2s indented; clicking one scrolls to it; a heading with no words is not listed and the others still scroll to the right place
[ ] 2 or fewer headings: no contents list
[ ] long page: the page scrolls, nothing scrolls inside it
[ ] paragraphs read from the left, not centred as on a card
### Study: when an intro comes up
[ ] fresh deck with a deck intro: Study shows the intro before the first card; "Study" (or Enter) goes on to the card
[ ] deck intro + intro of a deck inside + of one inside that: they come one after another, outermost first, then the card
[ ] the crumbs above an inner deck's page lead back to the outer pages that have an intro (not to ones without)
[ ] a deck inside with no intro, under a deck with one: only the outer one comes up
[ ] pass an intro, reload before grading: it does not come back
[ ] pass the last page of a run, reload: it does not come back either
[ ] grade a card, then clear browser storage (or another browser / device): no intro comes up, since the deck has been begun
[ ] another browser / device before any card is graded: the intro comes up again there
[ ] moving on to the next deck inside (unlocked by progression) with its own intro: that intro comes up before its first card
[ ] a deck where some cards have been studied but the intro was written afterwards: it does not come up by itself (Intro button only)
[ ] a flattened deck: only its own intro is left (the decks inside, and their intros, are gone)
[ ] studying a deck inside another directly (from My flashcards or the breadcrumb): the outer decks' intros first (unless begun), then its own, then the card
[ ] Enter while a button or link on the page has focus does what that button does, not "Study"
[ ] while an intro is up, Space / 1-4 / z / e do nothing to the card behind it
[ ] zen mode on: the intro shows with the normal chrome, zen comes back on the card
[ ] cram on a never-studied deck with an intro: the intro comes up first, then the cram cards
[ ] no flash of the intro on load when it has already been passed
### Study: Intro button
[ ] "Intro" at the bottom right shows when the card's deck or one around it has an intro; opens the nearest one
[ ] on a page opened this way the button reads "Close" when no card is up, "Study" when one is; it goes back to the card
[ ] the crumbs on that page open the outer pages
[ ] not shown while editing a card (e); not shown when nothing on the way has an intro
[ ] opened intro, then switch deck in the breadcrumb: the page closes (does not reappear later when that deck comes round)
[ ] done screen (no card up): Intro still opens the page of what is being studied
### Mixed decks
[ ] a Mixed deck with two decks inside, each with an intro: each one's intro comes up before its own first card, not the other's
[ ] the Intro button opens the intro of the deck the card on screen is from
### Reset
[ ] Settings → Reset deck: the intros of the deck and of every deck inside it come up again in study on this browser
[ ] another deck's passed intros are not affected by the reset
### Marketplace
[ ] upload a deck with intros: the admin review has an "Intros" tab with the deck's page and those of the decks inside it (with their trail), in reading order; "No intro pages" when there are none
[ ] after approval, taking the deck: intros come up in study as for an own deck
[ ] marketplace deck's intro page: read only (no Edit, no e, no editor), crumbs lead only to pages that have an intro
[ ] the author editing their intro after publishing does not change the published one
### Importer
[ ] a spec with deck / chapter intros writes them ("N intro page(s) written")
[ ] re-importing keeps intros up to date and does not duplicate them

# Needed before launch
[ ] slug for deck and study?subdeck better?
[ ] in zen mode should be able to change subdeck
[ ] fsrs learning from machine learning reviews
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
[ ] archive marketplace (and mb normal) decks so you dont have to see them in your list
[ ] responsive
[ ] phone app
[ ] maybe allow subdecks alone to be put into metadeck?
[ ] should deck progression be auto or allow to unlock when you reach end of current cards?
[ ] maybe call intro for first exposure articles instead? And maybe do "First exposure articles" a card type that can be put anywhere and is then only shown once do introduce what subsequent cards are about?
[ ] update tactic card tooltip
[ ] maybe do tactic card intervals and #reps customizable to so creator can make fit different decks, but with sensible defaults.

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

## Nested decks: the plan (agreed 2026-10-16, replaces subdecks and metadecks)
The model:
- One kind of deck. Any deck can sit inside another, to any depth (Anki's way). Subdecks and metadecks go.
- A deck can hold cards and decks both; its own cards come before the decks inside it (Anki's default gather order does the same).
- A deck with decks inside has a setting: In order (each deck inside unlocks when the one before passes; its own cards, if any, count as the first) or Mixed (all open, new cards taken one from each in turn). It holds wherever study starts from. New parents start In order. Due reviews always come; only new cards wait.
- Studying a deck studies everything under it. A row's counts in My flashcards add up everything under it.
- One parent per deck (as Anki). Order among siblings is the user's own, not alphabetical.
- A bought deck can sit inside your own deck: its inside is fixed (nothing can be put in it), but In order / Mixed for the decks inside it is your own choice on your copy.
- Publishing: any deck of your own, with everything under it. Refused when a taken marketplace deck (paid or free) is anywhere inside. A taken deck is never publishable.
- Reset, delete, cram, statistics and the heatmap cover a deck and everything under it. Deleting a deck that has a bought deck inside moves the bought deck to the top level. Intros show from the outermost deck down, as now.
- Names are unique among siblings only.

Screens:
- My flashcards: one tree list (bought decks marked with a small grey marketplace icon right of the name, not on the decks inside). Expand arrow per deck, remembered per browser. "Create deck" makes one at the top.
- Dragging a row: onto a deck puts it inside (the deck highlights); between rows places it there at their level (a line shows where); between top-level rows takes it out.
- A grey settings wheel at the end of every row (always visible, so phones work) opens the deck's menu; right-click opens the same: New deck inside · Rename · In order / Mixed (on a deck with decks inside) · Flatten · Move to… (a picker of the tree) · Delete (asks only when it has cards). A bought deck's menu: Move to… · In order / Mixed · Make my own copy (open decks only) · Remove.
- Cards tab shows the deck's outline and moves cards between its decks; decks are created, nested, renamed and deleted in My flashcards only.
- Every deck, also one inside a bought deck, has its own pages (Study, Cards, Intro, Settings…) at /my-flashcards/<its id>.

Storage:
- decks: parent_id (its parent, null at the top), in_order, position among siblings (shared with bought decks there); names unique per (user, parent). uses_subdecks and progression_depth go.
- cards: deck_id is the deck the card sits in; subdeck_id goes. The subdecks table goes (each subdeck becomes a deck; card ids stay, so review history stays).
- marketplace_deck_instances: parent_id (own deck, set null when it is deleted), position, and the studier's own In order / Mixed per deck inside it. One instance per user and marketplace deck.
- marketplace_decks / marketplace_subdecks: in_order each; a marketplace card's subdeck_id may be null (the deck's own cards). uses_subdecks and progression_depth go.
- metadecks become decks (Mix → Mixed, In order → In order); a deck that was in several goes to the first. The profile's bulk progression switch goes.

Build order, each step usable on its own:
1. Tree logic (lib/deck-tree.js): outline, reading order, unlock rule per parent, new-card order (in order / mixed), counts. Tests first.
2. Migration (backup first, run on a copy) and the server: loading a deck with everything under it and its ancestors, create / move / nest with the ownership and loop checks, flatten, delete, reset.
3. My flashcards: the tree, drag to nest / reorder / take out, the wheel menu.
4. Deck pages for any deck: Study, Cards, the Add cards picker, Settings, Intro, Statistics.
5. Bought decks: under your own decks, In order / Mixed on your copy.
6. Marketplace: publish any deck's tree, the refusal, admin review, approval, Contents outline.
7. Importer: spec chapters become decks inside the spec's deck.
8. Remove metadecks, subdecks and the old code; a test checklist here.
Later, its own feature: "Others may build on this" on free decks (FOSS): takers get "Make my own copy" (an editable deck of their own, keeping their progress, credited "Based on X by Y"); a version built on an open deck is always free and open.

Progress (built 2026-10-16 on branch nested-decks, merged):
- [x] 1. Tree logic (lib/deck-tree.js, with tests).
- [x] 2. Migration (web/scripts/migrate-nested-decks.mjs; backup in scratch/db-backups) and the server (decks.getLibrary / getDeck / create / move / remove / flatten / setInOrder / reset).
- [x] 3. My flashcards: one tree, drag to nest / reorder / take out, the wheel menu (also on right-click), Move to…, the marketplace mark.
- [x] 4. Deck pages for any deck, also one inside a bought deck: Study (breadcrumb of the decks around it, switcher), Cards (the deck's own cards first, a header per deck inside), Add cards and import pickers, Settings (Decks inside: In order / Mixed), Intro.
- [x] 5. Bought decks: inside your own decks, read only there, In order / Mixed on your copy, Remove.
- [x] 6. Marketplace: publish any deck's tree, refused with a bought deck inside; admin review and approval copy the tree; Contents outline.
- [x] 7. Importer: chapters are decks inside the spec's deck, may hold cards and chapters both; the deck is found by name wherever it sits.
- [x] 8. Metadecks, subdecks, the profile's bulk progression switch and the old code removed; test checklist at the top of this file.
Changed on the way: the Cards tab and Add cards no longer make decks inside (My flashcards does); deck names are 1–100 characters (were 4–100).

## Subdecks and metadecks: the plan (agreed 2026-10-07, built; replaced by nested decks above)
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
Decided 2026-10-09: do as Anki and FSRS's own optimizer do. Optimize only from cards that still exist, and for each card only from its last fresh start (the reviews since it was last new; a review log's `state` says where that is, so a reset needs no marker). Reviews of deleted cards are kept for the heatmap and statistics, not for optimization.

## restart deck (delete all progress of deck and do such that its a fresh deck from fsrs perspective)

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
