import { parametersFor, dayOf } from "$lib/server/fsrs-optimizer.js"

// a refit under way is streamed: the page opens on the parameters stored,
// and study switches when it lands
const load = async event => {
	const { parameters, refitted } = await parametersFor(event.locals.userId, dayOf(event));
	return { fsrsParameters: parameters, refitted };
};

export { load }
