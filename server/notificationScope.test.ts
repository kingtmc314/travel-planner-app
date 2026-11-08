import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ markRead: vi.fn() }));
vi.mock("./db", () => ({ markNotificationRead: state.markRead }));
import { appRouter } from "./routers";
const context = (id: number | null) =>
  ({
    user: id === null ? null : { id, openId: "qa", name: "QA", role: "user" },
    req: {},
    res: {},
  }) as any;
beforeEach(() => vi.clearAllMocks());
describe("notification mark-read user scope", () => {
  it("passes the authenticated subscriber ID, never a client user ID", async () => {
    await appRouter
      .createCaller(context(7))
      .notifications.markRead({ notifId: 55 });
    expect(state.markRead).toHaveBeenCalledTimes(1);
    expect(state.markRead).toHaveBeenCalledWith(55, 7);
  });
  it("does not touch records when unauthenticated", async () => {
    await expect(
      appRouter
        .createCaller(context(null))
        .notifications.markRead({ notifId: 55 })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(state.markRead).not.toHaveBeenCalled();
  });
  it("rejects negative, fractional and out-of-range notification IDs", async () => {
    for (const notifId of [-1, 0, 1.5, 2147483648])
      await expect(
        appRouter.createCaller(context(7)).notifications.markRead({ notifId })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.markRead).not.toHaveBeenCalled();
  });
});
