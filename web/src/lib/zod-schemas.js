import { z } from "zod";

const loginUser = z.object({
		email: z.string().email("Invalid email address"),
		password: z.string().min(6, "Password must be minimum 6 characters")
}).strict();


const registerUser = z.object({
		email: z.string().email("Invalid email address"),
		password: z.string().min(6, "Password must be minimum 6 characters"),
		confirmPassword: z.string()
	}).refine(user => user.password === user.confirmPassword, {
		error: "Password and confirm password doesn't match",
		path: ["confirmPassword"]
	}).strict();

// A name is kept as typed but for the space around it, and its length is
// counted without that space. What a parse answers with is what to store.
const deck = z.string().trim().min(4, "Deck name must be minimum 4 characters").max(100, "Deck name must be 100 characters or less");

const metadeck = z.string().trim().min(4, "Metadeck name must be minimum 4 characters").max(100, "Metadeck name must be 100 characters or less");

const subdeck = z.string().trim().min(1, "A subdeck needs a name").max(100, "Subdeck name must be 100 characters or less");

export { loginUser, registerUser, deck, metadeck, subdeck }
