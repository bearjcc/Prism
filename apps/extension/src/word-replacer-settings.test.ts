import { describe, expect, test } from "vitest";
import {
  exportWordReplacerJson,
  importWordReplacerJson,
  readWordReplacerSettings,
} from "./word-replacer-settings.js";

describe("word replacer settings", () => {
  test("import and export round trip", () => {
    const json = exportWordReplacerJson(readWordReplacerSettings(undefined));
    const imported = importWordReplacerJson(json);
    expect(imported.pairs.length).toBeGreaterThan(0);
    expect(imported.pairs[0]?.find).toBe("scuba");
  });

  test("import rejects empty pairs", () => {
    expect(() => importWordReplacerJson('{"pairs":[]}')).toThrow(
      /at least one valid pair/u,
    );
  });
});
