import { describe, expect, it } from "vitest";
import {
  authConfigured,
  buildAuthProviders,
  configuredProviderIds,
  oauthProviderConfigured,
} from "./auth-providers";

describe("auth providers", () => {
  it("requires both client id and secret", () => {
    expect(oauthProviderConfigured("id", "secret")).toBe(true);
    expect(oauthProviderConfigured("id", "")).toBe(false);
    expect(oauthProviderConfigured(undefined, "secret")).toBe(false);
  });

  it("builds only configured providers", () => {
    const providers = buildAuthProviders({
      AUTH_GITHUB_ID: "gh-id",
      AUTH_GITHUB_SECRET: "gh-secret",
      AUTH_GOOGLE_ID: "",
      AUTH_GOOGLE_SECRET: "",
    });
    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe("github");
  });

  it("lists configured provider ids", () => {
    expect(
      configuredProviderIds({
        AUTH_GITHUB_ID: "gh-id",
        AUTH_GITHUB_SECRET: "gh-secret",
        AUTH_GOOGLE_ID: "go-id",
        AUTH_GOOGLE_SECRET: "go-secret",
      }),
    ).toEqual(["github", "google"]);
  });

  it("requires AUTH_SECRET and at least one provider", () => {
    expect(
      authConfigured({
        AUTH_SECRET: "secret",
        AUTH_GITHUB_ID: "gh-id",
        AUTH_GITHUB_SECRET: "gh-secret",
      }),
    ).toBe(true);
    expect(
      authConfigured({
        AUTH_SECRET: "secret",
        AUTH_GITHUB_ID: "gh-id",
        AUTH_GITHUB_SECRET: "",
      }),
    ).toBe(false);
    expect(
      authConfigured({
        AUTH_SECRET: "",
        AUTH_GITHUB_ID: "gh-id",
        AUTH_GITHUB_SECRET: "gh-secret",
      }),
    ).toBe(false);
  });
});
