import { redirect } from "@sveltejs/kit"

export const load = ({ params }) => {
	redirect(303, `/marketplace/${params.id}/description`);
}
