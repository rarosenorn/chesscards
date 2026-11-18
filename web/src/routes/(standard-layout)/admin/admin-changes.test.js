import { describe, it, expect, vi, beforeEach } from "vitest"

const marketplace = vi.hoisted(() => ({ approveChangeRequest: vi.fn(), rejectChangeRequest: vi.fn(), getChangeRequestForReview: vi.fn() }));
vi.mock("$lib/server/marketplace.js", () => marketplace);

const { actions } = await import("./changes/[id=uuid]/+page.server.js");

const post = async (action, fields = {}) => {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	try {
		return await actions[action]({ params: { id: "r" }, request: new Request("http://localhost/admin/changes/r", { method: "POST", body }) });
	} catch (thrown) {
		return { status: thrown.status, location: thrown.location };
	}
};

describe("the admin's change requests", () => {
	beforeEach(() => {
		marketplace.approveChangeRequest.mockReset();
		marketplace.rejectChangeRequest.mockReset();
	});

	it("approving goes back to the admin page, so a reload doesn't post it again", async () => {
		expect(await post("approve")).toEqual({ status: 303, location: "/admin" });
		expect(marketplace.approveChangeRequest).toHaveBeenCalledWith("r");
	});

	it("a name taken since it was asked for: the reason, nothing approved", async () => {
		marketplace.approveChangeRequest.mockRejectedValue(Object.assign(new Error("dup"), { code: "23505" }));
		expect((await post("approve")).data.errors).toEqual(["A marketplace deck with this name already exists"]);
	});

	it("rejecting needs a reason, and goes back to the admin page", async () => {
		expect((await post("reject", { reason: " " })).data.errors).toEqual(["A rejection reason is required"]);
		expect(marketplace.rejectChangeRequest).not.toHaveBeenCalled();
		marketplace.rejectChangeRequest.mockResolvedValue(true);
		expect(await post("reject", { reason: "rude" })).toEqual({ status: 303, location: "/admin" });
		expect(marketplace.rejectChangeRequest).toHaveBeenCalledWith("r", "rude");
	});
});
