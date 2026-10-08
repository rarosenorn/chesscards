import { error } from "@sveltejs/kit"
import { isUuid } from "../uuid.js"

// What a remote function is handed comes from the browser as it pleases. An
// id that is not one, or a list that is not a list, is a bad request (400)
// here, before it can fail as a query (500).
const checkIds = (...ids) => {
	if (!ids.flat().every(isUuid)) error(400, "Bad request");
}

const checkIdList = ids => {
	if (!Array.isArray(ids)) error(400, "Bad request");
	checkIds(ids);
}

// a place in a list: a whole number, or none given
const checkIndex = index => {
	if (index != null && !Number.isInteger(index)) error(400, "Bad request");
}

export { checkIds, checkIdList, checkIndex }
