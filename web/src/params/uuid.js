// Route ids that go to the database as uuids: anything else is no such page
// (a 404), where the query would have failed on it.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const match = param => UUID.test(param);
