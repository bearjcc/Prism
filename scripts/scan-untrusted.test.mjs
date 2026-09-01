import { describe, expect, test } from "vitest";
import { gateScanScore } from "./scan-untrusted.mjs";

describe("gateScanScore", () => {
  test("fails without a numeric score", () => {
    expect(gateScanScore({}).ok).toBe(false);
  });

  test("fails below the floor", () => {
    expect(gateScanScore({ score: 79 }, 80).ok).toBe(false);
  });

  test("passes at the floor", () => {
    expect(gateScanScore({ score: 80 }, 80).ok).toBe(true);
  });
});
