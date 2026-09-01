import { execFileSync, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkPublishableTree } from "./check-publishable-tree.mjs";

const FAIL_BELOW = 80;

function gitLsFiles(root) {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  return out.split("\0").filter(Boolean);
}

export function scanTrackedArtefacts(root) {
  return checkPublishableTree(gitLsFiles(root));
}

function runScanJson(root) {
  const npmCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npmCmd, ["--yes", "aislop@latest", "scan", "--json"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      AISLOP_NO_HISTORY: "1",
    },
  });
  if (result.error) {
    throw result.error;
  }
  const stdout = result.stdout ?? "";
  const start = stdout.indexOf("{");
  if (start < 0) {
    throw new Error("scan --json produced no JSON object");
  }
  const parsed = JSON.parse(stdout.slice(start));
  return { parsed, status: result.status ?? 1 };
}

export function gateScanScore(report, failBelow = FAIL_BELOW) {
  const score = report?.score;
  if (typeof score !== "number") {
    return {
      ok: false,
      message: "scan did not return a numeric score",
    };
  }
  if (score < failBelow) {
    return {
      ok: false,
      message: `scan score ${score} is below ${failBelow}`,
    };
  }
  return { ok: true, message: `scan score ${score}` };
}

const thisFile = fileURLToPath(import.meta.url);
const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]).toLowerCase() === thisFile.toLowerCase();

if (isMain) {
  const root = join(dirname(thisFile), "..");
  const artefacts = scanTrackedArtefacts(root);
  if (!artefacts.ok) {
    for (const message of artefacts.messages) {
      console.error(message);
    }
    process.exit(1);
  }

  const { parsed } = runScanJson(root);
  const errors = parsed.summary?.errors ?? 0;
  const warnings = parsed.summary?.warnings ?? 0;
  const gate = gateScanScore(parsed, FAIL_BELOW);
  console.log(
    `${gate.message}; ${errors} error(s), ${warnings} warning(s); scanner is not vendored`,
  );
  if (!gate.ok) {
    process.exit(1);
  }
}
