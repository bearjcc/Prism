import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@prism/schema/capabilities",
        replacement: path.join(root, "packages/schema/src/capabilities.ts"),
      },
      {
        find: "@prism/schema/validate",
        replacement: path.join(root, "packages/schema/src/validate.ts"),
      },
      {
        find: "@prism/schema",
        replacement: path.join(root, "packages/schema/src/index.ts"),
      },
    ],
  },
  test: {
    include: [
      "packages/schema/src/**/*.test.ts",
      "apps/extension/src/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
  },
});
