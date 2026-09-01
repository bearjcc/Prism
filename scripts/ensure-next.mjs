import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextRoot = join(root, "node_modules", "next");
const required = [
  join(nextRoot, "package.json"),
  join(nextRoot, "dist", "shared", "lib", "zod.js"),
];

function missingFiles() {
  return required.filter((file) => !existsSync(file));
}

function nextVersion() {
  const lockPath = join(root, "package-lock.json");
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    const version = lock.packages?.["node_modules/next"]?.version;
    if (typeof version === "string" && version.length > 0) {
      return version;
    }
  }
  throw new Error("package-lock.json has no node_modules/next version");
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    if (result.stdout) {
      console.error(result.stdout);
    }
    if (result.stderr) {
      console.error(result.stderr);
    }
    process.exit(result.status ?? 1);
  }
  return result;
}

const missing = missingFiles();
if (missing.length === 0) {
  process.exit(0);
}

console.error("Next.js install is incomplete; restoring from the npm tarball.");
for (const file of missing) {
  console.error(`  missing ${file}`);
}

const version = nextVersion();
const work = mkdtempSync(join(tmpdir(), "prism-next-"));
try {
  run("npm", ["pack", `next@${version}`, `--pack-destination=${work}`], root);
  const tarball = join(work, `next-${version}.tgz`);
  if (!existsSync(tarball)) {
    console.error(`npm pack did not write ${tarball}`);
    process.exit(1);
  }
  run("tar", ["-xzf", tarball, "-C", work], work);
  const extracted = join(work, "package");
  if (!existsSync(join(extracted, "dist", "shared", "lib", "zod.js"))) {
    console.error("Next.js tarball is missing dist/shared/lib/zod.js");
    process.exit(1);
  }
  rmSync(nextRoot, { recursive: true, force: true });
  cpSync(extracted, nextRoot, { recursive: true });
} finally {
  rmSync(work, { recursive: true, force: true });
}

const stillMissing = missingFiles();
if (stillMissing.length > 0) {
  console.error("Failed to restore Next.js into node_modules/next.");
  for (const file of stillMissing) {
    console.error(`  missing ${file}`);
  }
  process.exit(1);
}
