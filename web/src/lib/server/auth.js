import "dotenv/config"
import { betterAuth } from "better-auth"
import { genericOAuth, twoFactor } from "better-auth/plugins"
import { pool } from "./pool.js"
import { sendMail } from "./mail.js"
import { cleanName } from "../display-name.js"

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

// A display name nobody has yet: the one asked for or, when it is taken, the
// same with four random digits after it. Names are public (a review is signed
// with one) and unique whatever the case; the profile page is where a name
// that came out with digits gets changed.
const freeName = async name => {
	const taken = async candidate => {
		const { rowCount } = await pool.query('select 1 from "user" where lower(name) = lower($1)', [candidate]);
		return rowCount > 0;
	}
	let candidate = name;
	while (await taken(candidate)) {
		candidate = `${name}${Math.floor(1000 + Math.random() * 9000)}`;
	}

	return candidate;
}

export const auth = betterAuth({
	database: pool,
	// Every way in (email, Lichess, Google) creates its user here, and the
	// auth API's own rename comes through update: a name is cleaned on both
	// (display-name.js), so none is a look-alike of another's.
	databaseHooks: {
		user: {
			create: {
				before: async user => ({ data: { ...user, name: await freeName(cleanName(user.name) || "player") } })
			},
			update: {
				// a name that cleans away to nothing is no rename
				before: async user => {
					if (!("name" in user)) return { data: user };
					const name = cleanName(user.name);
					return name ? { data: { ...user, name } } : false;
				}
			}
		},
		session: {
			create: {
				before: async (session, ctx) => ({
					data: { ...session, twoFactorVerified: ctx?.path?.startsWith("/two-factor/verify-") ?? false }
				})
			}
		}
	},
	session: {
		additionalFields: {
			twoFactorVerified: { type: "boolean", defaultValue: false, input: false }
		}
	},
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
		}),
		twoFactor({ issuer: "Chesscards" })
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
			highlightEveryMove: { type: "boolean", defaultValue: false, input: false },
			animationDuration: { type: "number", defaultValue: 150, input: false },
			rolloverHour: { type: "number", defaultValue: 4, input: false },
			chesscomUsername: { type: "string", required: false, input: false },
			lichessUsername: { type: "string", required: false, input: false }
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
