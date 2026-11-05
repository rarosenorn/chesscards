import { wiseBatchCsv } from "$lib/server/payouts.js"

export const GET = async () => new Response(await wiseBatchCsv(), {
	headers: {
		"content-type": "text/csv; charset=utf-8",
		"content-disposition": `attachment; filename="chesscards-payouts-${new Date().toISOString().slice(0, 10)}.csv"`
	}
});
