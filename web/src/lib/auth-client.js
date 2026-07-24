import { createAuthClient } from "better-auth/svelte"
import { genericOAuthClient } from "better-auth/client/plugins"

// talks to the better-auth endpoints mounted in hooks.server.js;
// genericOAuthClient adds signIn.oauth2 for the lichess provider
export const authClient = createAuthClient({
	plugins: [genericOAuthClient()]
});
