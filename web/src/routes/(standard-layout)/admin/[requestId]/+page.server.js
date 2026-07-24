import { redirect } from "@sveltejs/kit"

export const load = ({ params }) => {
	redirect(303, `/admin/${params.requestId}/description`);
}
