#!/usr/bin/env node
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const names = ["kitten-ad-replace", "youtube-home-videos", "youtube-reddit-comments"];
for (const name of names) {
  const b64Path = join(dir, `${name}.webp.b64`);
  const outPath = join(dir, `${name}.webp`);
  if (!existsSync(b64Path)) {
    console.error("missing", b64Path);
    process.exit(1);
  }
  const buf = Buffer.from(readFileSync(b64Path, "utf8"), "base64");
  writeFileSync(outPath, buf);
  unlinkSync(b64Path);
  console.log("wrote", outPath, "bytes", buf.length);
}
