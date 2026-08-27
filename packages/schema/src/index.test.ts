import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import {
  CAPABILITY_IDS,
  SCHEMA_PACKAGE_NAME,
  packMod,
  validateManifest,
} from "./index.js";

test("exported schema package name matches package.json", () => {
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name: string };
  expect(pkg.name).toBe("@prism/schema");
  expect(SCHEMA_PACKAGE_NAME).toBe(pkg.name);
});

test("schema entry point exports Phase B APIs", () => {
  expect(CAPABILITY_IDS).toHaveLength(7);
  expect(validateManifest).toBeTypeOf("function");
  expect(packMod).toBeTypeOf("function");
});
