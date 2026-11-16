import { parametersFor } from "$lib/server/fsrs-optimizer.js"
import { DEFAULT_ROLLOVER_HOUR, TZ_COOKIE } from "$lib/rollover.js"

// a refit under way is streamed: the page opens on the parameters stored,
// and study switches when it lands
const load = async ({ locals, cookies }) => {
	const { parameters, refitted } = await parametersFor(locals.userId, {
		rolloverHour: locals.user?.rolloverHour ?? DEFAULT_ROLLOVER_HOUR,
		timeZone: cookies.get(TZ_COOKIE) || Intl.DateTimeFormat().resolvedOptions().timeZone
	});
	return { fsrsParameters: parameters, refitted };
};

export { load }
