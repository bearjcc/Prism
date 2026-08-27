import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { SCHEMA_PACKAGE_NAME } from "@prism/schema";
import {
  EXTENSION_PACKAGE_NAME,
  SCHEMA_NAME_FROM_EXTENSION,
  createCapabilityGate,
} from "./index.js";

const extRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("exported extension package name matches package.json", () => {
  const pkg = JSON.parse(readFileSync(join(extRoot, "package.json"), "utf8")) as {
    name: string;
  };
  expect(pkg.name).toBe("@prism/extension");
  expect(EXTENSION_PACKAGE_NAME).toBe(pkg.name);
});

test("extension consumes the schema package name", () => {
  expect(SCHEMA_NAME_FROM_EXTENSION).toBe(SCHEMA_PACKAGE_NAME);
  expect(SCHEMA_NAME_FROM_EXTENSION).toBe("@prism/schema");
});

test("extension TypeScript project references schema", () => {
  const tsconfig = JSON.parse(
    readFileSync(join(extRoot, "tsconfig.json"), "utf8"),
  ) as { references?: { path: string }[] };
  expect(tsconfig.references).toEqual(
    expect.arrayContaining([{ path: "../../packages/schema" }]),
  );
});

test("extension entry point exports the capability gate", () => {
  expect(createCapabilityGate).toBeTypeOf("function");
});
