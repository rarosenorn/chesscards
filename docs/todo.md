# Client:
[ ] Refresh session? Right now it just expires after 30 days and user has to log in again. Maybe refresh on fetchUserInfo or smt?

[ ] CSRF token: understand and implement, important for 
session cookie based auth, Same-Site Strict/Lax and, Secure and HttpOnly
options are not enough apparently for some reason
[ ] 
- change deck / flashcards from every deck being blueprintDeck and studyDeck, to only having for peoples own decks and ones they share for free to be all contained in one object. 
- Then non free decks on marketplace are version controlled and have marketplace_deck and marketplace_card instances that have those decks metadata and card info, then when someone buys it, they get an instance of that deck, i.e. study_deck and study_cards that references the information in marketplace_deck. 

- this has the benefit that decks people make for themselves is simpler, and when sharing free people get a copy that they can use and change. Then for the ones that are marketplace decks get special treatment with seperated because they need to be more controlled and many people will have same deck, so makes sense to have deck info only in 1 place.

- why? bc its nice to have all sellable decks in one table and because its overkill to have different table for deck/card info and for deck/card progress for each personal deck.
Also because people that get free deck should be able to alter it, also people can "fork" marketplace decks maybe? (dont know, its probably copyright)

# Server
