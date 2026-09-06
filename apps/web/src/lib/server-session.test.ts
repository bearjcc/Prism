import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "../auth";
import { getServerSession, isServerAuthenticated } from "./server-session";

describe("server session", () => {
  it("returns the auth session", async () => {
    const session = { user: { id: "acct-1", email: "bear@example.com" } };
    vi.mocked(auth).mockResolvedValueOnce(session);

    await expect(getServerSession()).resolves.toEqual(session);
  });

  it("detects authenticated sessions", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "acct-1" } });
    await expect(isServerAuthenticated()).resolves.toBe(true);

    vi.mocked(auth).mockResolvedValueOnce(null);
    await expect(isServerAuthenticated()).resolves.toBe(false);
  });
});
