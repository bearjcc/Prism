import { describe, expect, it } from "vitest";
import { capabilitySummary } from "./capability-copy";

describe("capabilitySummary", () => {
  it("describes LinkedIn Home first-degree filtering", () => {
    const summary = capabilitySummary("linkedin.home.allowlist");
    expect(summary).not.toBe("Declared Prism capability.");
    expect(summary).toMatch(/LinkedIn Home/iu);
    expect(summary).toMatch(/first-degree|followed/i);
  });
});
