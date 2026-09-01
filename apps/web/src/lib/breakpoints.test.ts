import { describe, expect, it } from "vitest";
import { HOME_OVERLAY, SITE_NAV_WIDE } from "./breakpoints";

describe("layout breakpoints", () => {
  it("keeps the home overlay and site nav on rem queries", () => {
    expect(HOME_OVERLAY).toBe("(min-width: 64rem)");
    expect(SITE_NAV_WIDE).toBe("(min-width: 60rem)");
  });
});
