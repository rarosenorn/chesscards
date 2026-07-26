# Currently working on
## correct move card
Instead of showing correct move in position on back, just show the arrow on the front board when you do "Show" and have explanation on back appear as to why.
s

for claude: 
(Q = shows in question and answer mode, A = shows in answer mode)
Features:

2. 
- Q and A toggle showing always be showing
- Hide should be "Hide answer" and button should be still at bottom but to the left
- Give the bottom row a little more padding towards the top
- h dosent work as shortcut to hide
- give space between board block and text in study and browse 26px, and board has top padding 10 for some reason, it shouldnt have (maybe its because of styling in editor mode to make space for something?) it shouldnt have in study mode anyways.
- do min height 700px
- can we do shortcut t to toggle focused board / block / editor between answer and question mode
- dont focus the when when opening editor, just the board (the fen focus causes screen to jump too far down weirdly
bugs:
- When adding another board to a block and saving, both boards fen and button line below extend beyond the board to the right
- Actually im thinking that either a whole chessboard block is either A or Q and boards in a block cant choose themselves. only the moves and annotations for a board in a block iff the whole block is Q. If the whole chessboard block is A, then doing A moves and annotations in boards doesnt make sense, because the boards arent showing in Q anyways. make sense?


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
