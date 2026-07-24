import "dotenv/config"
import nodemailer from "nodemailer"

// Provider-agnostic SMTP transport. Dev: Mailpit (docker) at localhost:1025,
// no auth, web inbox at localhost:8025. Production: point the env vars at any
// SMTP provider (or swap this file for an API-based sender).
const transport = nodemailer.createTransport({
	host: process.env.SMTP_HOST ?? "localhost",
	port: Number(process.env.SMTP_PORT ?? 1025),
	secure: process.env.SMTP_SECURE === "true",
	auth: process.env.SMTP_USER
		? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
		: undefined
});

const sendMail = ({ to, subject, text, html }) =>
	transport.sendMail({
		from: process.env.SMTP_FROM ?? "Chesscards <no-reply@chesscards.local>",
		to,
		subject,
		text,
		html
	});

export { sendMail }
