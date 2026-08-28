import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  ManifestValidationError,
  validateManifest,
} from "./validate.js";

const schemaRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const goldenManifest = readFileSync(
  join(schemaRoot, "test", "fixtures", "golden", "prism.yaml"),
  "utf8",
);

describe("validateManifest", () => {
  test("accepts the golden v1 manifest", () => {
    const manifest = validateManifest(goldenManifest, "golden/prism.yaml");

    expect(manifest.id).toBe("golden.mod");
    expect(manifest.runtime).toBe("native");
    expect(manifest.capabilities.optional).toContain("network.egress");
    expect(manifest.egress?.contracts[0]?.id).toBe("remote-images");
  });

  test("rejects an unknown root field with its position", () => {
    const source = `id: example.mod
version: 1.0.0
runtime: native
capabilities:
  required: []
scopes: []
surprise: true
`;

    expectValidationIssue(source, "surprise", 7);
  });

  test("rejects an unknown nested field", () => {
    const source = `id: example.mod
version: 1.0.0
runtime: native
capabilities:
  required: []
  surprise: []
scopes: []
`;

    expectValidationIssue(source, "capabilities.surprise", 6);
  });

  test("rejects a missing id", () => {
    const source = `version: 1.0.0
runtime: native
capabilities:
  required: []
scopes: []
`;

    expectValidationIssue(source, "id is required", 1);
  });

  test.each([".", "..", "nested/mod", "nested\\mod"])(
    "rejects unsafe mod id %s",
    (id) => {
      const source = `id: ${JSON.stringify(id)}
version: 1.0.0
runtime: native
capabilities:
  required: []
scopes: []
`;

      expectValidationIssue(source, "safe path segment", 1);
    },
  );

  test("rejects a capability outside the v1 registry", () => {
    const source = `id: example.mod
version: 1.0.0
runtime: native
capabilities:
  required:
    - browser.everything
scopes: []
`;

    expectValidationIssue(source, "browser.everything", 6);
  });

  test("rejects network egress without a contract", () => {
    const source = `id: example.mod
version: 1.0.0
runtime: native
capabilities:
  required:
    - network.egress
scopes: []
`;

    expectValidationIssue(source, "egress contract", 6);
  });

  test("rejects an empty egress section", () => {
    const source = `id: example.mod
version: 1.0.0
runtime: native
capabilities:
  required: []
scopes: []
egress:
  contracts: []
`;

    expectValidationIssue(source, "at least one egress contract", 7);
  });
});

function expectValidationIssue(
  source: string,
  message: string,
  line: number,
): void {
  try {
    validateManifest(source, "fixture/prism.yaml");
    throw new Error("Expected manifest validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(ManifestValidationError);
    const validationError = error as ManifestValidationError;
    expect(validationError.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "fixture/prism.yaml",
          line,
          message: expect.stringContaining(message),
        }),
      ]),
    );
  }
}
