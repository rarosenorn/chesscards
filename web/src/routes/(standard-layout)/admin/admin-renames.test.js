import { describe, it, expect, vi, beforeEach } from "vitest"

const marketplace = vi.hoisted(() => ({ approveRenameRequest: vi.fn(), rejectRenameRequest: vi.fn() }));
vi.mock("$lib/server/marketplace.js", () => marketplace);

const { actions } = await import("./+page.server.js");

const post = async (action, fields) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	try {
		return await actions[action]({ request: new Request("http://localhost/admin", { method: "POST", body }) });
	} catch (thrown) {
		return { status: thrown.status, location: thrown.location };
	}
};

describe("the admin's rename requests", () => {
	beforeEach(() => {
		marketplace.approveRenameRequest.mockReset();
		marketplace.rejectRenameRequest.mockReset();
	});

	it("approving goes back to the admin page, so a reload doesn't post it again", async () => {
		expect(await post("approveRename", { requestId: "r" })).toEqual({ status: 303, location: "/admin" });
		expect(marketplace.approveRenameRequest).toHaveBeenCalledWith("r");
	});

	it("a name taken since it was asked for: the reason, nothing approved", async () => {
		marketplace.approveRenameRequest.mockRejectedValue(Object.assign(new Error("dup"), { code: "23505" }));
		expect((await post("approveRename", { requestId: "r" })).data.errors).toEqual(["A marketplace deck with this name already exists"]);
	});

	it("rejecting needs a reason, and goes back to the admin page", async () => {
		expect((await post("rejectRename", { requestId: "r", reason: " " })).data.errors).toEqual(["A rejection reason is required"]);
		expect(marketplace.rejectRenameRequest).not.toHaveBeenCalled();
		marketplace.rejectRenameRequest.mockResolvedValue(true);
		expect(await post("rejectRename", { requestId: "r", reason: "rude" })).toEqual({ status: 303, location: "/admin" });
		expect(marketplace.rejectRenameRequest).toHaveBeenCalledWith("r", "rude");
	});
});
