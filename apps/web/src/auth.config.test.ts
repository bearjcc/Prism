import { describe, expect, it } from "vitest";
import { authConfigured } from "./lib/auth-providers";
import { signInEnabled } from "./auth.config";

describe("sign-in configuration", () => {
  it("matches authConfigured", () => {
    const env = {
      AUTH_SECRET: "test-secret",
      AUTH_GITHUB_ID: "gh-id",
      AUTH_GITHUB_SECRET: "gh-secret",
    };
    expect(signInEnabled(env)).toBe(authConfigured(env));
  });
});
