// Route ids that go to the database as uuids: anything else is no such page
// (a 404), where the query would have failed on it.
export { isUuid as match } from "$lib/uuid.js"
