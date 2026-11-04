import { describe, it, expect, beforeEach, vi } from "vitest"
import { mount, unmount, tick } from "svelte"

const { authClient, goto, invalidateAll } = vi.hoisted(() => ({
	authClient: {
		signIn: { email: vi.fn(), social: vi.fn(), oauth2: vi.fn() },
		sendVerificationEmail: vi.fn(),
		twoFactor: { enable: vi.fn(), disable: vi.fn(), verifyTotp: vi.fn(), verifyBackupCode: vi.fn() }
	},
	goto: vi.fn(async () => {}),
	invalidateAll: vi.fn(async () => {})
}));
vi.mock("$lib/auth-client.js", () => ({ authClient }));
vi.mock("$app/navigation", () => ({ goto, invalidateAll }));
vi.mock("$app/state", () => ({ page: { url: new URL("http://localhost/login?redirect_to=/admin") } }));

const { default: TwoFactorSettings } = await import("./TwoFactorSettings.svelte");
const { default: LoginPage } = await import("../../routes/login/+page.svelte");

const settle = async () => {
	for (let i = 0; i < 5; i++) {
		await tick();
		await new Promise(resolve => setTimeout(resolve, 0));
	}
};

const open = async (component, props = {}) => {
	const target = document.createElement("div");
	document.body.append(target);
	const app = mount(component, { target, props });
	await settle();
	const button = label => [...target.querySelectorAll("button")].find(el => el.textContent.trim() === label);
	return {
		target, button,
		text: () => target.textContent.replace(/\s+/g, " ").trim(),
		press: async label => { button(label).click(); await settle(); },
		type: async (selector, value) => {
			const input = target.querySelector(selector);
			input.value = value;
			input.dispatchEvent(new Event("input", { bubbles: true }));
			await settle();
		},
		submit: async () => {
			target.querySelector("form").dispatchEvent(new Event("submit", { cancelable: true }));
			await settle();
		},
		close: () => { unmount(app); target.remove(); }
	};
};

const totpURI = "otpauth://totp/Chesscards:a%40b.test?secret=JBSWY3DPEHPK3PXP&issuer=Chesscards";
const backupCodes = Array.from({ length: 10 }, (_, i) => `code-${i}`);

beforeEach(() => {
	for (const fn of [goto, invalidateAll, authClient.signIn.email, ...Object.values(authClient.twoFactor)]) fn.mockReset();
	goto.mockImplementation(async () => {});
	invalidateAll.mockImplementation(async () => {});
});

describe("two-factor settings", () => {
	it("sets up: password, then the QR, key and backup codes, then a code turns it on", async () => {
		authClient.twoFactor.enable.mockResolvedValue({ data: { totpURI, backupCodes } });
		authClient.twoFactor.verifyTotp.mockResolvedValue({ data: {} });
		const view = await open(TwoFactorSettings, { enabled: false, verified: false });
		expect(view.text()).toContain("Admin needs two-factor login");
		await view.press("Set up");
		await view.type("input[type=password]", "pw");
		await view.submit();
		expect(authClient.twoFactor.enable).toHaveBeenCalledWith({ password: "pw" });
		expect(view.target.querySelector(".qr svg")).not.toBeNull();
		expect(view.target.querySelector(".secret").textContent).toBe("JBSWY3DPEHPK3PXP");
		expect(view.target.querySelectorAll(".backup-codes li")).toHaveLength(10);
		await view.type("input[inputmode=numeric]", " 123456 ");
		await view.submit();
		expect(authClient.twoFactor.verifyTotp).toHaveBeenCalledWith({ code: "123456" });
		expect(invalidateAll).toHaveBeenCalled();
		expect(view.target.querySelector(".qr")).toBeNull();
		view.close();
	});

	it("says so on a wrong password or a wrong code, and Cancel starts over", async () => {
		authClient.twoFactor.enable.mockResolvedValueOnce({ error: { code: "INVALID_PASSWORD" } });
		const view = await open(TwoFactorSettings, { enabled: false, verified: false });
		await view.press("Set up");
		await view.type("input[type=password]", "nope");
		await view.submit();
		expect(view.text()).toContain("Wrong password");
		authClient.twoFactor.enable.mockResolvedValueOnce({ data: { totpURI, backupCodes } });
		await view.submit();
		authClient.twoFactor.verifyTotp.mockResolvedValueOnce({ error: { code: "INVALID_CODE" } });
		await view.type("input[inputmode=numeric]", "000000");
		await view.submit();
		expect(view.text()).toContain("Wrong code");
		expect(invalidateAll).not.toHaveBeenCalled();
		await view.press("Cancel");
		expect(view.button("Set up")).toBeTruthy();
		view.close();
	});

	it("when on: turning off asks the password", async () => {
		authClient.twoFactor.disable.mockResolvedValue({ data: { status: true } });
		const view = await open(TwoFactorSettings, { enabled: true, verified: true });
		expect(view.text()).toContain("On. Logging in");
		await view.press("Turn off");
		await view.type("input[type=password]", "pw");
		await view.submit();
		expect(authClient.twoFactor.disable).toHaveBeenCalledWith({ password: "pw" });
		expect(invalidateAll).toHaveBeenCalled();
		view.close();
	});

	it("when on but this session had no code: says admin is locked", async () => {
		const view = await open(TwoFactorSettings, { enabled: true, verified: false });
		expect(view.text()).toContain("admin is locked");
		view.close();
	});
});

describe("logging in with two-factor", () => {
	const toCodeStep = async () => {
		authClient.signIn.email.mockResolvedValue({ data: { twoFactorRedirect: true, twoFactorMethods: ["totp"] } });
		const view = await open(LoginPage);
		await view.type("#email", "a@b.test");
		await view.type("#password", "pw");
		await view.submit();
		return view;
	};

	it("asks for the app's code after the password, then goes on", async () => {
		const view = await toCodeStep();
		expect(view.target.querySelector("#password")).toBeNull();
		expect(view.text()).toContain("Code from your authenticator app");
		expect(view.text()).not.toMatch(/Log in with (Lichess|Google)/);
		authClient.twoFactor.verifyTotp.mockResolvedValue({ data: {} });
		await view.type("#code", "123456");
		await view.submit();
		expect(authClient.twoFactor.verifyTotp).toHaveBeenCalledWith({ code: "123456" });
		expect(goto).toHaveBeenCalledWith("/admin", { invalidateAll: true });
		view.close();
	});

	it("takes a backup code instead", async () => {
		const view = await toCodeStep();
		await view.press("Use a backup code");
		expect(view.text()).toContain("Backup code");
		authClient.twoFactor.verifyBackupCode.mockResolvedValue({ data: {} });
		await view.type("#code", "abcde-fghij");
		await view.submit();
		expect(authClient.twoFactor.verifyBackupCode).toHaveBeenCalledWith({ code: "abcde-fghij" });
		expect(goto).toHaveBeenCalled();
		view.close();
	});

	it("a wrong code stays on the code step; a timed-out login goes back to the password", async () => {
		const view = await toCodeStep();
		authClient.twoFactor.verifyTotp.mockResolvedValueOnce({ error: { code: "INVALID_CODE", status: 401 } });
		await view.type("#code", "000000");
		await view.submit();
		expect(view.text()).toContain("Wrong code");
		expect(view.target.querySelector("#code")).not.toBeNull();
		authClient.twoFactor.verifyTotp.mockResolvedValueOnce({ error: { code: "INVALID_TWO_FACTOR_COOKIE", status: 401 } });
		await view.submit();
		expect(view.text()).toContain("The login timed out");
		expect(view.target.querySelector("#password")).not.toBeNull();
		expect(goto).not.toHaveBeenCalled();
		view.close();
	});

	it("without two-factor, the password alone logs in", async () => {
		authClient.signIn.email.mockResolvedValue({ data: { user: {} } });
		const view = await open(LoginPage);
		await view.type("#email", "a@b.test");
		await view.type("#password", "pw");
		await view.submit();
		expect(goto).toHaveBeenCalledWith("/admin", { invalidateAll: true });
		view.close();
	});
});
