import { parametersFor } from "$lib/server/fsrs-optimizer.js"
import { DEFAULT_ROLLOVER_HOUR, TZ_COOKIE } from "$lib/rollover.js"

const load = async ({ locals, cookies }) => ({
	fsrsParameters: await parametersFor(locals.userId, {
		rolloverHour: locals.user?.rolloverHour ?? DEFAULT_ROLLOVER_HOUR,
		timeZone: cookies.get(TZ_COOKIE) || Intl.DateTimeFormat().resolvedOptions().timeZone
	})
});

export { load }
