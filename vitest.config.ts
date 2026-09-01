import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

function cssModuleClassNames(source: string): string {
  const names = new Set<string>();
  for (const match of source.matchAll(/\.([A-Za-z_][\w]*)\s*[,:{]/g)) {
    names.add(match[1]);
  }
  return [...names].map((name) => `"${name}":"${name}"`).join(",");
}

export default defineConfig({
  plugins: [
    {
      name: "vitest-css-modules-stub",
      transform(code, id) {
        const file = id.split("?")[0] ?? id;
        if (!file.endsWith(".module.css")) {
          return null;
        }
        return {
          code: `export default {${cssModuleClassNames(code)}};`,
          map: null,
        };
      },
    },
  ],
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: [
      {
        find: "@prism/schema/archive",
        replacement: path.join(root, "packages/schema/src/archive.ts"),
      },
      {
        find: "@prism/schema/css",
        replacement: path.join(root, "packages/schema/src/css.ts"),
      },
      {
        find: "@prism/schema/inspect-package",
        replacement: path.join(root, "packages/schema/src/inspect-package.ts"),
      },
      {
        find: "@prism/schema/usercss-map",
        replacement: path.join(root, "packages/schema/src/usercss-map.ts"),
      },
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
    testTimeout: 30_000,
    include: [
      "packages/schema/src/**/*.test.ts",
      "apps/extension/src/**/*.test.ts",
      "scripts/**/*.test.mjs",
      "apps/web/src/**/*.test.ts",
      "apps/web/src/**/*.test.tsx",
    ],
  },
});
