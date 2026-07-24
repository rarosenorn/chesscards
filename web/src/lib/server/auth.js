import "dotenv/config"
import { betterAuth } from "better-auth"
import { genericOAuth } from "better-auth/plugins"
import { pool } from "./pool.js"
import { sendMail } from "./mail.js"

// deliberately plain process.env (not $env): the better-auth CLI loads this
// file outside the SvelteKit build to generate the database schema

const link = (label, url) => ({
	text: `${label}: ${url}`,
	html: `<p><a href="${url}">${label}</a></p>`
});

// Lichess is an open OAuth2 provider: public client with PKCE, no secret and
// no registration; any client id string identifies the app.
const lichessUserInfo = async tokens => {
	const headers = { Authorization: `Bearer ${tokens.accessToken}` };
	const account = await (await fetch("https://lichess.org/api/account", { headers })).json();
	const { email } = await (await fetch("https://lichess.org/api/account/email", { headers })).json();
	return {
		id: account.id,
		name: account.username,
		email,
		// lichess verifies emails itself
		emailVerified: true
	};
}

export const auth = betterAuth({
	database: pool,
	baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:5173",
	secret: process.env.BETTER_AUTH_SECRET,
	advanced: {
		// domain tables reference user ids as uuid
		database: { generateId: () => crypto.randomUUID() }
	},
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 6,
		requireEmailVerification: true,
		sendResetPassword: async ({ user, url }) => {
			await sendMail({
				to: user.email,
				subject: "Reset your Chesscards password",
				...link("Reset your password", url)
			});
		}
	},
	emailVerification: {
		sendOnSignUp: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			await sendMail({
				to: user.email,
				subject: "Verify your Chesscards email",
				...link("Verify your email", url)
			});
		}
	},
	// Google requires a registered OAuth client (cloud console); only enabled
	// once its credentials are in the env
	socialProviders: process.env.GOOGLE_CLIENT_ID
		? {
			google: {
				clientId: process.env.GOOGLE_CLIENT_ID,
				clientSecret: process.env.GOOGLE_CLIENT_SECRET
			}
		}
		: {},
	plugins: [
		genericOAuth({
			config: [
				{
					providerId: "lichess",
					clientId: process.env.LICHESS_CLIENT_ID ?? "chesscards-dev",
					clientSecret: "",
					authorizationUrl: "https://lichess.org/oauth",
					tokenUrl: "https://lichess.org/api/token",
					scopes: ["email:read"],
					pkce: true,
					getUserInfo: lichessUserInfo
				}
			]
		})
	],
	user: {
		// board preferences and the admin flag live on the user row, so the
		// session lookup returns them with no extra query
		additionalFields: {
			isAdmin: { type: "boolean", defaultValue: false, input: false },
			pieceSet: { type: "string", defaultValue: "standard", input: false },
			boardTheme: { type: "string", defaultValue: "default", input: false },
			borderType: { type: "string", defaultValue: "black", input: false },
			showCoordinates: { type: "boolean", defaultValue: true, input: false },
			animationDuration: { type: "number", defaultValue: 300, input: false }
		},
		deleteUser: {
			enabled: true,
			sendDeleteAccountVerification: async ({ user, url }) => {
				await sendMail({
					to: user.email,
					subject: "Confirm deleting your Chesscards account",
					...link("Delete your account", url)
				});
			}
		}
	}
});
