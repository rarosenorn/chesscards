# Currently working on
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
