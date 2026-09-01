import { describe, expect, test } from "vitest";
import {
  checkPublishableTree,
  isUnpublishablePath,
} from "./check-publishable-tree.mjs";

describe("isUnpublishablePath", () => {
  test("rejects extra root markdown, canvases, and non-allowlisted hidden paths", () => {
    expect(isUnpublishablePath("NOTES.md")).toBe(true);
    expect(isUnpublishablePath("Documentation/scratch.canvas.tsx")).toBe(true);
    expect(isUnpublishablePath(".tooling/session.json")).toBe(true);
    expect(isUnpublishablePath(".aislop/history.jsonl")).toBe(true);
    expect(isUnpublishablePath("apps/web/.next/trace")).toBe(true);
  });

  test("allows published source and scan/CI config", () => {
    expect(isUnpublishablePath("README.md")).toBe(false);
    expect(isUnpublishablePath("CONTRIBUTING.md")).toBe(false);
    expect(isUnpublishablePath("apps/extension/src/gate.ts")).toBe(false);
    expect(isUnpublishablePath("Documentation/adr/0001-project-licence.md")).toBe(
      false,
    );
    expect(isUnpublishablePath(".gitignore")).toBe(false);
    expect(isUnpublishablePath(".github/workflows/ci.yml")).toBe(false);
    expect(isUnpublishablePath(".aislop/config.yml")).toBe(false);
    expect(isUnpublishablePath(".aislopignore")).toBe(false);
  });
});

describe("checkPublishableTree", () => {
  test("fails closed when a forbidden path is tracked", () => {
    const result = checkPublishableTree(["README.md", ".tooling/foo"]);
    expect(result.ok).toBe(false);
    expect(result.messages[0]).toMatch(/\.tooling\/foo/);
  });

  test("passes a clean index", () => {
    expect(checkPublishableTree(["README.md", "package.json"]).ok).toBe(true);
  });
});
