// An id as the database gives them out. Anything else is no such thing: a
// 404 as a route's id (params/uuid.js), a bad request as one handed to the
// server (server/ids.js), where the query would have failed on it.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = value => typeof value === "string" && UUID.test(value);
