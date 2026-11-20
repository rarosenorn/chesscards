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

## Articles
### Writing an article
[ ] Add cards: the Type row has Basic / Tactic / Article; hovering Article shows "First exposure article: Card that is seen once to introduce what is subsequently studied with flashcards"
[ ] Article chosen: one editor, no "Front" / "Back" labels, no snowflake; H1 / H2 buttons in the bar; the input sits as far below the bar as Add card below it
[ ] F9 does nothing while Article is chosen
[ ] Add card with nothing written: "The card must have atleast 1 non-empty text field or 1 chessboard"
[ ] Add card: the editor clears completely ("Card added"); the article is at the end of the chosen deck in Cards
[ ] write a Back on a Basic card, switch to Article, then back to Basic: the Back is still there
[ ] the type is remembered for the deck, like Basic / Tactic (reload, leave and come back)
[ ] boards and moves in an article: the moves (e4) dialog lists only the article's boards
### Cards tab
[ ] an article previews as a page, no Front / Back divider; headings render; 3 or more headings give a contents list that scrolls to them
[ ] Type column: Article; Due "New" until read, "-" after; State "-"
[ ] the Type dropdown turns a Basic card into an Article and back; the preview follows
[ ] Edit card on an article: Article selected in the Type row, one editor with H1 / H2, no Back; Save keeps the headings
[ ] sort by Type: Basic, then Tactic, then Article
[ ] copy an article to another deck: the copy comes up unread in study; moving one keeps it read or unread
### Study
[ ] an unread article comes up where it sits among the new cards, as a page titled with its deck's name, the decks around it named above
[ ] Continue (or Enter) goes on to the next card; the article does not come back, also after a reload, in another browser or on another device
[ ] two articles in a row: double-clicking Continue, holding Enter, or pressing Enter with Continue focused reads only the first
[ ] while an article is up, Space / 1-4 / e / Delete / z do nothing
[ ] the new count (blue) leaves articles out, in study and in My flashcards
[ ] Cram leaves articles out: the counter's total has none, read or not
[ ] zen mode on: the article shows with the bars, zen comes back on the next card
[ ] In order deck: the next deck unlocks once the one before has its article read and its cards passed
[ ] Mixed deck: each deck inside has its article come before that deck's own cards
[ ] no Intro button at the bottom right any more
[ ] Edit a Basic card in study, change it to Article, Save: it shows as a page; Continue reads it
[ ] with the server stopped, Continue still goes on; after a reload the article comes up again
### Reset
[ ] Settings → Reset deck: the articles of the deck and of every deck inside it come up again
### Marketplace
[ ] upload a deck with articles: the admin Browse shows them as pages; there is no Intros tab
[ ] after approval, taking the deck: the articles come up once in study for the buyer; reading one changes nothing for the author or other buyers
[ ] a sample card that is an article shows as a page on the deck's marketplace page
### Old intro pages
[ ] decks that had an intro page now have an Article as their first card; ones begun before have it read (Defending 101: the deck's and Defend your king › Picking the right square's)
[ ] /my-flashcards/<id>/intro is gone (404)
### Importer
[ ] a spec with "intro" makes an Article the deck's / chapter's first card; re-importing does not duplicate it
[ ] "type": "article" cards import as articles anywhere among the cards; one with a back is refused

## Payments
### Setup
[ ] restart the dev server after .env changes (STRIPE_WEBHOOK_SECRET, SUPPORT_EMAIL)
[ ] keep running: stripe listen --forward-to localhost:5173/api/stripe/webhook --events checkout.session.completed,checkout.session.async_payment_succeeded,charge.updated,charge.refunded,charge.dispute.closed
[ ] test card 4242 4242 4242 4242, any future date, any CVC; emails land in Mailpit (localhost:8025)
[ ] use a second account as the buyer; your own account is the author of both test decks

### Buying a deck
[ ] logged out: Buy sends you to log in
[ ] a paid deck you don't own: "Buy for $X" with "30-day money-back guarantee" under it (link to the terms); no checkbox
[ ] Buy opens Stripe Checkout: the deck's name, the price in USD with VAT included (shows VAT for an EU address)
[ ] cancel in Checkout: back on the deck page, nothing bought
[ ] pay: you land in My flashcards with the deck there; the confirmation email names the deck, the price, the 30-day guarantee with its last date, and that it covers the 14-day withdrawal right
[ ] a free deck: "Get for free", straight into My flashcards, no Checkout
[ ] declined card (4000 0000 0000 0002): Checkout says so, nothing bought
[ ] two tabs: buy the same deck in both; the second payment is refunded by itself (Stripe dashboard) and you have one deck

### Owned decks
[ ] owned and in My flashcards: the price button greyed out with the green Owned to its right
[ ] delete it from My flashcards, then open its marketplace page: greyed price, Owned, and a Get button below; Get brings it back free, progress starts over
[ ] the Owned badge also shows on the marketplace list tile
[ ] your own deck as author: greyed price and Owned; Get only if you have deleted the deck you published from
[ ] the buyer can review the deck; the author can't review their own

### Refunds and chargebacks
[ ] refund a purchase in the Stripe dashboard (full amount): the deck leaves the buyer's My flashcards, their review is gone, the deck page offers Buy again
[ ] a partial refund changes nothing
[ ] buy again after a refund: works, a new purchase
[ ] wiki FAQ "Can I get a refund?" and the terms say the same: 30 days, email support@chesscards.io, once per deck

### Off sale and taken down
[ ] author, deck settings or the marketplace page: "Take off sale"; then a buyer still sees it in the list and opens it, someone without it doesn't see it in the list and gets 404 on its page
[ ] off sale: an owner can still delete it and Get it back
[ ] "Put back on sale" brings it back for everyone
[ ] delete the deck you published from: the marketplace page still has the on/off sale button
[ ] admin (2FA session): every deck page has a reason field and "Take down"; empty reason is refused; the author gets an email with the reason
[ ] taken down: the author sees "Taken down by Chesscards: reason" on the page and in deck settings, and no on-sale button; owners keep it; others get 404
[ ] admin sees taken-down decks in the list and can Restore; the author is emailed

### Author deletes their account
[ ] the delete dialog says published decks stay with those who have them, off sale
[ ] after deleting: buyers still have the deck, the author shows as the name they last had, buyers can still review it; others get 404

### Payout details (author of a paid deck)
[ ] Settings has a Payouts section; an author of only free decks, or a non-author, doesn't
[ ] Save asks for payout email, name on the bank account and its currency; a name or email starting with = or + is refused
[ ] a new payout email isn't used until you click the link sent to your account email; the link page only shows it, Confirm sets it; the link works once and for a day
[ ] changing it again: the old payout email gets "Your Chesscards payout email was changed"
[ ] Settings shows "Earned and not yet paid" and past payouts

### Monthly payouts (admin, /admin/payouts)
[ ] to test now, move a test sale into last month: update purchases set created_at = now() - interval '35 days' where id = '...';
[ ] Due lists each author: sales, earned, refunds, total; under $10 rolls over; no payout details rolls over; first payout and changed payout email are flagged
[ ] this month's sales and refunded-before-payout sales aren't in it
[ ] Prepare: payouts appear under Prepared; preparing again adds nothing
[ ] Download Wise batch file: one row per payout, USD source, the author's currency
[ ] Mark paid: moves to Paid, each author gets an email; the author's Settings shows it
[ ] refund a sale that was paid out: next month's due takes its share off; Settings shows it as refunds to be taken from the next payouts
[ ] Undo on the latest paid payout: its sales are due again; an older payout has no Undo
[ ] a sale refunded after Prepare: the prepared payout is flagged "cancel and prepare again"

## Cards from a game
### Fetching games
[ ] Add cards → Import from game: the Chess.com and Lichess fields hold the last name that found games (also after a reload)
[ ] Fetch shows the newest 3 games; Load more adds 30 at a time, going back month by month (Chess.com) / page by page (Lichess)
[ ] double-click Load more: every game shows once, nothing breaks
[ ] press Fetch twice quickly on Lichess: the list loads, no "rate limit" error
[ ] an unknown name: "No Chess.com player called …" / "No Lichess player called …"
[ ] a player with no games: "No games yet."
[ ] Chess960 and other variants are not listed
[ ] a row: speed icon, time control ("3 + 2", "10 min", "3 days"), both players with ratings, Won / Draw / Lost from your side, the date
[ ] Fetch on the other site replaces the list
[ ] a marketplace deck has no Import from game (the page is not found)

### Making cards
[ ] clicking a game asks "Make cards from this game" with Blunders / Mistakes / Inaccuracies and, with decks inside, the Deck picker
[ ] all three unticked: "Nothing to look for: pick blunders, mistakes or inaccuracies"
[ ] progress: "Analysing the game: position x of y" → "Writing explanations: x of y" → "Adding the cards" → "n cards added."
[ ] only your side's moves become cards, and only the kinds ticked
[ ] a game with nothing to card: "Nothing to make a card of in this game."
[ ] the new cards are in Cards and Study straight away, in the deck chosen
[ ] the imported game is marked in the list
[ ] Cancel while analysing or writing stops it and adds no cards; there is no Cancel while "Adding the cards"
[ ] start another game while one runs: "You already have a game being analysed"
[ ] leave for Cards and come back, or reload: the progress carries on and the cards arrive
[ ] a second tab on the same deck shows the same progress; Cancel in one clears the other
[ ] delete the deck the cards go into while it analyses: "The deck the cards were going into is gone"
[ ] sign out in another tab while it runs: the page stops with an error instead of asking forever

### The cards
[ ] front "Why was 27.Qxg5 a blunder, and what is a better move?"; the board is from your side and opens with your move played
[ ] turning it plays the opponent's punishment on the board, with a green arrow for the better move
[ ] back: "27.Qxg5 was a blunder because …" and "27.Qf3 was the best move because … [line]"; the line steps on the board
[ ] a variation in parentheses after a bullet steps through on the board too
[ ] a missed mate: "because it misses mate in N", the whole mate as the line
[ ] stalemating when winning: "because it stalemates Black, which is a draw"
[ ] repeating a third time when winning: "because it repeats the position a third time, which is a draw"
[ ] trading down to a draw by material when winning: "because it leaves too little material to mate, which is a draw"
[ ] the move that let you get mated is a card; your own mating move never is
[ ] castling and promotion are never called mistakes when they were the engine's move
[ ] the reasons name only moves that are on the card; no square brackets, no "T1", no evaluation numbers

## PGN paste
### On a board in a card (Add cards)
[ ] paste a PGN (Lichess "Copy PGN", Chess.com share → PGN) into the FEN field under a board: the board gets the game's moves from the usual start; the arrows step through them
[ ] a game set up from a position (PGN with a [FEN] tag): the board starts from that position
[ ] comments, clock times and variations in the PGN: only the main line comes in
[ ] a PGN of several games (a whole Lichess study): the first game comes in
[ ] a board that already had moves, arrows and a back side: moves, back side and the arrows after the start are replaced; arrows on the starting position stay
[ ] Ctrl+Z right after the paste brings the old board back
[ ] Edit on the pasted board opens on the moves, at the last move
[ ] pasting a FEN works as before
[ ] pasting text that is neither ("hello", a PGN with an illegal move): the field turns red and Add card is blocked

### In the open board editor
[ ] paste a PGN into the editor's FEN field: the field shows the start FEN, the move list shows the game, the board stands on the last move, and you can record on from there
[ ] Cancel after pasting brings the old board back; Save keeps the game
[ ] the same on a board on the back side

### Editing a card
[ ] the same on a board when editing a card from the Cards tab

## Boards: Analyse and Play
[ ] card boards (study, Cards, the deck's sample cards) show "Analyse" then "Play" at the top right
[ ] Analyse opens Lichess's analysis board in a new tab: seen from the board's side, with the line so far, on the move the board stands on
[ ] following a move from the text, Analyse opens that line instead
[ ] a puzzle not yet solved: Analyse and Play give only the position shown, never the hidden moves
[ ] Play opens Lichess's game against the computer from the position shown, as the side the board is seen from
[ ] a mated or stalemated position: no Play
[ ] articles' and deck descriptions' boards have Analyse and Play too

## Defending 101
### Order
[ ] My flashcards: Defending 101 › Defend your king (6 decks inside) › Defend your pieces (6) › Synthesis
[ ] each method: its Article, then "Describe the defence ...", then 2 puzzles; only the first puzzle names the method
[ ] Synthesis unlocks only once both parts have passed (the deck is In order)
### Content
[ ] every puzzle plays with the defender to move and the board turned to the defender
[ ] clickable moves in the articles and answers play on the right board
[ ] Pinning the attacker (king), 2nd puzzle: "Anything slower allows mate"; Protecting the piece, 1st puzzle: "Moving the knight instead allows mate"

## Deck switcher (the arrow beside the deck's name)
### Every tab
[ ] the arrow shows on Study, Cards, Add cards, Deck and Settings of a deck with decks inside it or around it; not on a deck with neither
[ ] it lists the decks around this one, then this one and the decks inside it, indented; this one is marked
[ ] choosing a deck opens the same tab of that deck (Cards → its Cards, Settings → its Settings, ...)
[ ] the names before the deck's name in the breadcrumb also open that same tab of their deck
[ ] from Add cards, a marketplace deck taken (or a deck inside one) opens its Study, since it has no Add cards; from Cards it opens its Cards
[ ] from Import from game (under Add cards), a deck of your own opens its Add cards
### Turning to another deck
[ ] Add cards: write something, turn to another deck: its Add cards opens with its own draft and type, and "Show duplicates" leads to that deck; turn back: the first deck's draft is still there
[ ] Cards: search, select a card, turn to another deck: its Cards opens unfiltered, on its first card
[ ] Cards: open a card in the editor, turn to another deck: "Unsaved changes" asks; Cancel stays; Leave goes, and the edit is gone when you come back
[ ] after one Leave, editing again and turning to yet another deck asks again
[ ] Study: a card showing its answer, turn to another deck: its card comes front up; a cram session is left and resumes when you turn back the same day
[ ] Settings: the rename field and the In order / Mixed choice show the deck turned to, not the one before

## Spaced repetition parameter optimization
### Settings
[ ] Settings has a "Spaced repetition parameter optimization" section with "Spaced repetition algorithm parameters are automatically optimized 14 days after the previous optimization."
[ ] a new account: "Not optimized yet: study uses the default parameters."
[ ] with under ~100 reviews: "Optimize parameters" gives "Last optimized <today> from N reviews; the default parameters are still in use."
[ ] with a few hundred reviews: "Last optimized <today> from N reviews." (N counts basic cards' reviews, not tactics')
[ ] the button reads "Optimizing…" while it runs, then "Optimize parameters" again; the date is today in your own time zone, also just after midnight
[ ] double-click "Optimize parameters": one optimization, no error
[ ] press "Optimize parameters" again within the hour: "Parameters can be optimized once an hour. Try again in N minutes."; after the hour it optimizes again
[ ] first Study visit (which optimizes by itself), then "Optimize parameters" right away: the once-an-hour message
[ ] reload Settings after optimizing: the same "Last optimized" line
[ ] optimize twice in a row (an hour apart) with no new reviews: the second keeps the same parameters, so study's intervals don't change
### Study
[ ] first visit to Study with no optimization yet: the page opens straight away; reload Settings: "Last optimized" is today
[ ] the interval under Good can change a moment after Study opens, when an optimization lands (only on a visit 14+ days after the last)
[ ] optimize in Settings in one tab while Study is open in another: that Study keeps its intervals until you open Study again
[ ] grading works as before with the default parameters (no optimization yet) and with your own
### Edge cases
[ ] reset a deck, study it again, optimize: no error; the reset cards count from their new start
[ ] delete a deck you have studied, optimize: still works, and N still counts that deck's reviews
[ ] study a marketplace deck you have taken, optimize: N includes its reviews

## Learning steps past the new day
### The buttons
[ ] a new card shown a few minutes before "A new day starts at" (4am by default): under Hard and Good a step that would end after 4am reads "1d", not minutes; Again (1m) still reads 1m if it ends before 4am
[ ] the same card in the afternoon: 1m / 6m / 10m as before
[ ] a card whose Hard would come back just under a day later never reads "24h": it reads "1d"
### When the card comes back
[ ] grade a card in the evening so a step ends after 4am: "Next review: tomorrow" when nothing else is left, not "in N hours"
[ ] after 4am the card is in Study's learning count and shows, not only at the hour the step ended
[ ] before 4am it does not show, also not in the last 20 minutes before 4am when nothing else is left (learn-ahead does not reach into tomorrow)
[ ] My flashcards: the deck's Learn number matches Study's, before and after 4am
[ ] Cards tab: the card's due date is the next day's date
[ ] a step that ends before 4am (graded in the afternoon) still comes back at its exact time
### Settings
[ ] Profile, "A new day starts at": the text says learning steps past the hour wait for it too
[ ] change the hour (e.g. to 6am): a step graded at 8pm ending at 5am now comes back at 5am exactly; at 4am it would have waited for 4am

## Desired retention
### Settings
[ ] Settings, "Desired retention": pills 80% 85% 90% 95% 97%, with 95% chosen on a new account
[ ] pick 90%: it saves on click (no button), and reload keeps 90%
[ ] Study a deck without its own: the intervals under Hard/Good/Easy on a review card are longer than at 95%
[ ] "Use for all decks": "Every deck uses this one now."; every deck's Settings then shows "As in Settings" or "Same as above" chosen
### A deck's Settings
[ ] a deck at the top: first pill "As in Settings (90%)", matching Settings; chosen until you pick another
[ ] a deck inside another: first pill "Same as above (X%)" with the deck above's value; change the deck above and it follows
[ ] pick 97% on a deck: reload keeps it; Study on that deck shows longer intervals than its sibling at 90%
[ ] pick "Same as above" again: it goes back to the deck above's value
[ ] the text under the heading mentions the decks inside only when there are decks inside
### Use for all decks inside
[ ] a deck with decks inside, some with their own retention: "Use for all decks inside" says "The decks inside follow this deck now."; each deck inside now shows "Same as above" chosen
[ ] the deck itself and decks beside it keep their own
[ ] a deck with nothing inside: no "Use for all decks inside" button
[ ] Tactic cards: the same button, and after it the decks of your own inside show the deck's ladder in their field
[ ] a deck holding only marketplace decks: the retention button is there, the tactic cards one is not
### Study
[ ] Study a deck with a deck inside at a different retention: cards of each deck show their own deck's intervals under the buttons
[ ] grade Good: the card's due date in the Cards tab matches what the button said
[ ] an optimization landing during Study (14+ days after the last): intervals still follow each card's deck retention
### Marketplace decks
[ ] a marketplace deck taken: its Settings has "Desired retention" too; pick 85%, reload, still 85%
[ ] a deck inside it: "Same as above (85%)"; its own pick sticks
[ ] remove the marketplace deck and take it again: its retention is back to "As in Settings"
[ ] "Use for all decks inside" on it clears the decks inside it

## Sielecki alt lines
[ ] a Quickstart card's back ends with "# Alt lines" and a numbered list of the chapter's other lines, in the deck's order, named as their cards are
[ ] each list item is one unbroken line of moves, no ! or ? between them: clicking a move plays the board from where that line leaves this card's line, to that move
[ ] the card's own line is not in its list
[ ] a chapter with one line (e.g. the Alekhine): no "# Alt lines" on its card
[ ] the Black deck's Tarrasch cards (4.Nf3 and 4.e3) each list the other

## Hide puts the card back as it came
### A board following a move in the text
[ ] Show, click a move in the back's text (an alt line): the front board plays it; Hide: the board is back on the position it opened on, the move line under it ends at the question's last move
[ ] Show again: the board stays on the question position, not on the clicked move
[ ] Shift+→ onto a text line after Show, then H: same as Hide, back on the opening position
### A board stepped through
[ ] a basic card: Show, step the board back to move 1 and forward into the answer, Hide: back where it opened
[ ] a line long enough to fold ("…"): open the "…", Hide: folded again as it first showed
[ ] a card with two front boards, both stepped: Hide puts both back
### Puzzles
[ ] a puzzle shown before it is played: Hide, and it starts over from its first move; play it through and the card turns
[ ] a tactic: Show, Hide, play it clean: the grade under Next stays as the first Show set it
[ ] a wrong move, then Space and H at once: the board shows the question position, not the wrong move
### Elsewhere
[ ] the editors' eye toggle (front board): closing the eye puts the board back where it opens
[ ] Next card after a Hide: the next card opens on its own question, nothing followed

## Marketplace deck names in URLs
### URLs
[ ] Marketplace: each deck opens at /marketplace/<its name>, lowercase with - between words ("L'Ami's Caro-Kann" is /marketplace/lamis-caro-kann)
[ ] Overview and Sample cards are tabs on that page: switching keeps the URL; /marketplace/<name>?view=sample-cards opens on Sample cards
[ ] the thumbnail, Buy/Get, Take off sale, Take down and the Deck tab's reviews of a taken deck all work from that page
[ ] Buy a paid deck and cancel on Stripe: back on the deck's page
[ ] /marketplace/no-such-deck: 404; the old /marketplace/<name>/overview and /cards: 404 too
[ ] vote on or write a review on Overview: the page stays where it was, the review shows
[ ] on Sample cards, Take off sale (author) or Take down (admin): the page comes back on Overview
[ ] logged out, Get on a free deck: log in, and you are back on the deck's page
### Upload request
[ ] request an upload named like a deck already on the marketplace, but spelled differently ("caro kann" next to "Caro-Kann"): refused with There is already a marketplace deck named "Caro-Kann"
[ ] a name with no letter or digit ("????"): A name needs a letter or a digit
[ ] the name "Checkout complete": A marketplace deck can't have this name
[ ] two requests with the same name, both pending: approve the first; approving the second says "A marketplace deck with this name already exists"
### Rename (author)
[ ] your deck's marketplace page: Rename under the buttons; someone else's deck: no Rename
[ ] Rename: the field starts with the name, Send for approval and Cancel beside it; Cancel closes it
[ ] send a new name: Renaming to "<name>" is pending review; the deck keeps its name until approved
[ ] send another before it's reviewed: the note shows the newer name, and Admin lists only that one
[ ] the same name as now: That is the deck's name already, and the field stays open with it
[ ] a name under 4 or over 100 characters: Name must be between 4 and 100 characters
[ ] another deck's name, in any spelling: There is already a marketplace deck named "<its name>"
[ ] a taken-down deck can still ask for a rename
### Rename (admin)
[ ] Admin: Pending rename requests lists the deck (linked), the new name, the author's email and the date
[ ] Approve: the deck shows the new name in the Marketplace and on its page, at its new URL; back on Admin, gone from the list
[ ] Reject without a reason: the browser asks for one; with one: the author sees Renaming to "<name>" was rejected: "<reason>".
[ ] reload Admin after approving or rejecting: nothing is posted again
[ ] a name taken by another deck after it was asked for: Approve says "A marketplace deck with this name already exists" and the deck keeps its name
[ ] the author deletes their account while a rename is pending: it leaves the list
### Old names
[ ] after a rename, the old URL lands on the deck under the new name (with ?view=sample-cards, on Sample cards)
[ ] rename twice (A to B to C): both A's and B's URLs land on C
[ ] rename back to the first name: its URL is the deck's own again; the middle one still leads to it
[ ] another deck uploaded or renamed with an old name: that URL now opens the other deck
[ ] change only the case ("Caro-kann" to "Caro-Kann"): the URL stays the same
[ ] take a renamed deck off sale, then open its old URL logged out: 404, no redirect to the new name; logged in as someone who has it: lands on the deck
[ ] a deck off sale or taken down: /marketplace/<name>/thumbnail logged out is a 404; someone who has it still sees the thumbnail on its page and in their Deck tab
[ ] a page left open from before the rename: a vote, review or Get still works

## Your marketplace decks
### Getting there
[ ] Marketplace: "Your marketplace decks" at the top right once you have a deck on the marketplace or an upload request; not there for someone with neither, or logged out
[ ] a deck's Settings, for a deck on the marketplace: its status and a "Your marketplace decks" button leading there; no Take off sale there any more
[ ] logged out, /author: the login page, and back to Your marketplace decks after logging in
[ ] /author-terms still opens logged out
### The page
[ ] no marketplace decks: "You have no decks on the marketplace…" with a link to My flashcards
[ ] a paid deck: "On sale · $10.00", then "N sales, M refunded · $X earned · N people have it · reviews: …"; above the decks the totals "N sales… · $X earned in all"
[ ] a free deck: "Free", no sales or earnings, only "N people have it"; with only free decks no Latest sales or Payouts sections
[ ] your own Get of your deck isn't counted in "people have it", nor a buyer whose purchase was refunded
[ ] Take off sale: the row says "Off sale" and the button "Put back on sale"; the deck is gone from the Marketplace for others but still opens for those who have it
[ ] a deck taken down by an admin: "Taken down", "Taken down by Chesscards: <reason>", no Take off sale
[ ] an upload request waiting: "Upload waiting for review"; rejected: "Upload rejected" with the reason
[ ] Latest sales: the last 50 sales with the date in your time zone, the deck, the price, "your share $X" (or "your share is being worked out" right after a purchase) and "refunded"; nothing about who bought
[ ] Payouts: the section that was in Settings, now here; Settings no longer has it
[ ] a refused payout detail (e.g. no currency): the message shows once, under Payouts
[ ] an expired payout email link: "Ask for a new one in Your marketplace decks" leads here
### The marketplace deck page
[ ] as the author: the greyed price with Owned, Get when the deck isn't in My flashcards, and the tabs; no Take off sale, Rename or taken-down note
[ ] as the author: replying to reviews still works there
[ ] as an admin: Take down with a reason, or the taken-down note with Restore
### Request changes
[ ] Request changes opens with the name, thumbnail and description as the deck's page has them; Next shows the sample cards the page shows
[ ] change only the name, Send for review: back on Your marketplace decks with "Changes to the name are waiting for review."; the deck's page still has the old name
[ ] change the thumbnail, description and sample cards: "Changes to the thumbnail, description and sample cards are waiting for review."
[ ] Request changes again while changes wait: it starts from them (the new name, the new thumbnail) and says "Asking again replaces the changes waiting for review; sending the page as it is takes them back."
[ ] with a new thumbnail waiting, "Keep the current one": the deck's own thumbnail again; sending drops the new one
[ ] Send for review with nothing changed and nothing waiting: "Nothing is changed"
[ ] send the page as it is while changes wait: back on Your marketplace decks, no note (also no old "were rejected" note)
[ ] a name another marketplace deck has: "There is already a marketplace deck named …"; 3 characters: "Name must be between 4 and 100 characters"
[ ] an empty description: "A description is required"
[ ] an image over 2MB, or not jpeg, png or webp: refused with the reason
[ ] double-click Send for review: one request
[ ] Cancel on step 1: back on Your marketplace decks, nothing sent
[ ] someone else opening /author/<your deck's id>/changes: not found
### Admin
[ ] Admin: "Pending change requests" lists the deck, what it changes ("name, thumbnail"), the new name, the user and the date
[ ] its page: Now and Asked for for each part asked for, and only those
[ ] Approve: the deck's page shows the changes; a new name moves the page to its new address and the old one redirects
[ ] Reject without a reason: "A rejection reason is required"; with one, the author sees "Changes to the … were rejected: "reason""
[ ] the author sends new changes while you have the request open: Approve says "Request not found or not pending"
[ ] approving a name another deck has taken since: "A marketplace deck with this name already exists"

# Needed before launch
## today
[y] slug for deck and study?subdeck better?
[y] author stats page to see stats of their marketplace decks, sales, refunds etc.

## general stuff
[ ] fix the card height in different modes differences
[ ] reporting reviews / decks
[ ] claude: Legal pages: terms of service, a privacy policy (GDPR), and a copyright and takedown policy. The last one matters because decks can be built from books and paid courses.
[ ] how to handle updating marketplace deck with what people alrdy have, if it all? (versioning)
[ ] claude api insteado f my own for importing bad moves from games (the explanations are terrible, probably just do with showing the blunder and showing the best move)
[ ] should deck progression be auto or allow to unlock when you reach end of current cards?
[ ] maybe do tactic card intervals and #reps customizable to so creator can make fit different decks, but with sensible defaults.
[ ] sort marketplace decks?
[ ] do update marketplace deck function s.t. an author can make changes to a deck and people who own the deck can choose to update to new version or no. how does chessable, anki and others do?

### last
[ ] db migrations
[ ] finish why flashcards page
[ ] change to fsrs 7
[ ] in zen mode should be able to change subdeck
[ ] Wiki page better
[ ] Landing page
[ ] responsive
[ ] phone app
[ ] lichess, chess.com and google login / signup (chess.com needs an OAuth application form: apply close to launch, not before)

## better UI for:
[ ] better request upload to marketplace UI
[ ] settings choosing stuff
[ ] go through alternate line ui
[ ] request upload to marketplace

## payment stuff
[ ] company: Danish sole proprietorship or Bulgarian company, decided with a DK–BG tax adviser before the live Stripe account
[ ] live Stripe account in the company's name: live restricted key, live webhook endpoint (checkout.session.completed, checkout.session.async_payment_succeeded, charge.updated, charge.refunded, charge.dispute.closed), real EU OSS VAT registration
[ ] accountant: confirm tax code txcd_20060358, bookkeeping of sales and author payouts (self-billing invoices?), how long to keep records
[ ] Stripe settles in USD to a Wise USD account (avoids ~2% conversion); turn on Link and Adaptive Pricing
[ ] Wise Business account; download its "send by email" batch template and match the CSV headers in wiseBatchCsv (payouts.js)
[ ] support@chesscards.io receives mail (forward to Gmail); a production SMTP provider
[ ] seller identity on /terms: company name, address, CVR/VAT number
[ ] lawyer review of /terms and /author-terms; privacy policy covering purchases and payout details
[ ] a real live-mode purchase and refund with a small amount before launch

## Play-out boards (endgame drills)
Like Chess.com Drills: a board in a card that you play against the computer until a goal. Useful for endgame decks especially.
- Card editor: a board can be set to "Play out against the computer", with a goal: Checkmate, Promote, or Hold the draw (held at stalemate, insufficient material or repetition, or after N moves with the draw kept).
- Opponent: Lichess tablebase API (tablebase.lichess.ovh), perfect play up to 7 pieces and the longest defence when losing. Covers basic endgames without an engine download. Over 7 pieces: Stockfish on our server, later.
- Fails the moment your move makes the result worse (a win becomes a draw, a draw becomes a loss), showing that move, with "Retry" from the start. Winning slowly is fine while it stays a win.
- Grades itself like played tactics: goal reached first try = Good, any failure = Again, one Next button.
- Tests: mount tests playing through a win, a held draw and a thrown win, with the tablebase answers stubbed.
- Before relying on it: check Lichess's rate limits and terms for the tablebase API in a paid app.

# Currently working on

## check backend code correctness of
- Card fsrs logic
- payment logic
- deck / card ownership logic

## others
- statistics page on your studying, maybe compared to others and maybe total?, maybe including total time spent studying?
- maybe do option to not have learning step for account || deck. some people may find annoying seeing same card 2 times the first day, either in general or for some specific deck.
- video in first exposure article
- maybe do puzzle type where you have to move for both Black and White? e.g. "what are the first 2 moves of Phillidor's Defense?"
- better prompt/popup design wise, e.g. confirm delete
- Since there are many settings, maybe once they become relevant show popup so user can read and make decision. e.g. for chapters first time they hit chapter limit explain why chapters and let them decide the config. Same with: study ahead 20 min incl. explanation,
- ?allow images in flashcard for e.g. easily inserting image of your blunder instead of copying fen and creating board and inserting fen?
- Live engine on the board: Stockfish running in the browser while you step through a card's position, like Lichess's local engine, with its settings (engine build, search time, multiple lines, threads, memory). Separate from the server analysis that makes blunder cards, which stays fixed at Lichess's setting.
- maybe later: Play and Analyse on our own board instead of opening Lichess. Stockfish in the browser (the live engine above); Play turns the board into a game against it, Analyse shows eval and best-move arrows. Mainly for mobile, where switching to a Lichess tab hurts. For now both open Lichess.
- maybe setting to change to piece symbols instead of e.g. B for bishop

## Personalized blunder and mistake cards
- Would be cool to have a feature that imports mistakes and blunders from your own game and creates a flashcard from it into your blunder deck with explanation why your move was bad and what the best move is and why. make it automatic like lichess game analysis extension to analyze your game, find bad moves, make flashcard from it with explanation
- Worth it as a feature for existing users: mistakes land in a dedicated "My blunders and mistakes" deck, in the same app and review queue as their openings. Not a differentiator on its own — Blunder Tutor, PatternChess and chess_trainer already do mistakes + spaced repetition + explanation (see chess-tools.md).
- Engine finds the mistakes and best line; AI only explains from the engine output. Filter to mistakes findable at the user's level, 2-3 per game, user picks which to keep.
- Later: also card your good finds (chess.com's great / brilliant). Great = you played the only move that holds the eval (needs the engine's top two moves); brilliant = that plus a material sacrifice. Front "find the move you played here", back explains why it works; same deck, tagged as a good find.
- Later, business model: one-time credit packs, not a subscription (see FAQ). Importing a game with engine lines only stays free up to a daily cap (analysis runs on our server); the AI explanation is the paid part, since it is the only thing with a real cost per use (measured at roughly 12-16¢ a game on Opus 5.5). Pack price to be set against that ($5 for 25 games would be too thin); first few free.

# Study features:
## study all button
- Button for study all, which studies all your decks in some way for interleaving all, still adhering to subdeck progression.

# when in edit mode, arrows cant both go back and forth in moves and control caret. what to do?
# footer for proffesional look
# contact page with email for bugs / ideas / business inquiries
# editor: do selectors for annotations like pieces with nice icons showing arrows and circle, selectable and between Start position Clean board and pieces above
# maybe: editor toggle for side to move (click the indicator to flip it) — only way now is editing the w/b in the FEN field
# finish Chesscards wiki with info on how app works, FSRS, card types etc.
# Overview over your decks on marketplace / how many got/purchased it stats
# Versioning of marketplace decks? If you improve it, request to update?
# Statistics

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

# AI prompts
## double check for security, logic, edgecases
Can you look through this feature and double check if the logic is correct, the edgecasesare correctly handled and if there are any security issues. Its ok if there are none and everything is good, just double check. If there are any, loop through previous statement until there are none. Take your time, its important.

## Add checklist for me to test through for feature
Can you add checklist in backlog.md for me to test this implemented feature, incl. edgecases.

# Done
[y] fsrs optimizer that uses reviews
[y] fsrs learning from machine learning reviews
[y] heatmap
[y] heatmap in myflashcards like anki heatmap and github heatmap
[y] allow PGN for board editor for both positions and moves import
[y] Do so if i card becomes due during a day, it becomes due at 2am local time, s.t. cards are rdy in the morning instead of dumping in through the day.(look how anki does)
[y] restart deck (delete all progress of deck and do such that its a fresh deck from fsrs perspective)
[y] if its your deck, do such that if you press e in study mode the editor comes up and youcan change stuff
[y] evaluation of deck: dont do stars theyre reductive. do recommend / do not recommend like steam and do comments with upvote / downvote buttons.
