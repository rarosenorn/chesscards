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

const deck = z.string().min(4, "Deck name must be minimum 4 characters").max(100, "Deck name must be 100 chararcters or less");

export { loginUser, registerUser, deck }
