# authController
## post
curl localhost:3000/api/auth/sign-up \
-H "Content-Type: application/json" \
-d '{"email": "rasmus@jakobsensoftware.com", "password": "safepassword"}'

# blueprintDeckController
## post
curl localhost:3000/api/blueprint-decks \
-H "Content-Type: application/json" \
-d '{ 
   "name": "nametest"
   }'

curl localhost:3000/api/blueprint-decks/blueprint-cards \
-H "Content-Type: application/json" \
-d '[{ 
      "id": "a264334a-1b55-4c1c-8691-b55f29316fb0",
      "blueprintDeckId": "a11192bc-0677-4800-a308-bb179ee3b9da",
      "front": "Anastasias mate",
      "back": "backtest0"
}, { 
      "id": "a264334a-1b55-4c1c-8691-b55f29316fb1",
      "blueprintDeckId": "a11192bc-0677-4800-a308-bb179ee3b9da",
      "front": "fronttest1",
      "back": "backtest1"
}]'

## get
## update
## delete

# studyDeckController
