#!/usr/bin/env node
import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const staging = join(root, "apps/web/public/previews/_staging");
const outDir = join(root, "apps/web/public/previews");

const expected = {
  "youtube-home-videos.part01.b64": "6a20d154dac25f6b91300b8e4b77476f18fbec5b",
  "youtube-home-videos.part02.b64": "76a29573a87bb0f1fe24fe40c53d7c8f32cc06e1",
  "youtube-home-videos.part03.b64": "65688a74cc39d97f9e24d5de593131e8a7c961e7",
  "youtube-home-videos.part04.b64": "020faf5188768715648a1b154bc00ff128fa0c02",
  "youtube-home-videos.part05.b64": "972bb2d81ecdf56a5ac0b0cb03a3225f828bbb24",
  "youtube-home-videos.part06.b64": "01388587d378a70bf6f91ba1a70257bb106f39bb",
  "youtube-home-videos.part07.b64": "fc87f5a212b314d92d01c5b72f83d6feb1884329",
  "youtube-reddit-comments.part00.b64": "1bf8efdea0774d9b9c13100755d93ba203d800ef",
  "youtube-reddit-comments.part01.b64": "e26c54bb96b8f264758dff78ce53328d6d91f8e8",
  "youtube-reddit-comments.part02.b64": "fab88b3d504f1b204336667cd4f30f4ab96ada9b",
  "youtube-reddit-comments.part03.b64": "8e4c3dae7985bd8e348df6fa2c82fa7c610b2a72",
  "youtube-reddit-comments.part04.b64": "a35f67b4d1acfe3c35c46feb2212f798beda975b",
  "youtube-reddit-comments.part05.b64": "34f1553ceae6c358d961936eeb2dc56dc286e36d",
  "youtube-reddit-comments.part06.b64": "86ad023ac812661ba28f59e833b0d5f309eab74c",
  "youtube-reddit-comments.part07.b64": "baaa97b4b13dd4e1cdd3706a60e5acbf67969fe7",
  "youtube-reddit-comments.part08.b64": "cae7fd13c129ecea3f4738bed8e3d1c56beff9e6",
  "youtube-reddit-comments.part09.b64": "2d563096afdc69f7f95bd70fc00b238a75d64e44",
  "youtube-reddit-comments.part10.b64": "a80936faad0477aef387a62f0cfa3b3925fa6c27",
};

function gitBlobSha(buf) {
  return createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest("hex");
}

if (!existsSync(staging)) {
  console.error("no staging dir");
  process.exit(1);
}

const files = readdirSync(staging);
const byName = new Map();
for (const f of files) {
  const m = /^(.*\.b64)\.(\d{2})$/.exec(f);
  if (!m) continue;
  const [, name, idx] = m;
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push({ idx: Number(idx), file: f });
}

let ok = 0;
for (const [name, parts] of byName) {
  parts.sort((a, b) => a.idx - b.idx);
  if (parts.length !== 6 || parts.some((p, i) => p.idx !== i)) {
    console.error("incomplete", name, parts.map(p => p.idx));
    continue;
  }
  const content = parts.map(p => readFileSync(join(staging, p.file), "utf8")).join("");
  const buf = Buffer.from(content, "utf8");
  const sha = gitBlobSha(buf);
  const want = expected[name];
  if (want && sha !== want) {
    console.error("SHA mismatch", name, sha, "want", want, "len", content.length);
    process.exitCode = 2;
    continue;
  }
  writeFileSync(join(outDir, name), content);
  for (const p of parts) unlinkSync(join(staging, p.file));
  console.log("wrote", name, "sha", sha, "len", content.length);
  ok++;
}
console.log("assembled", ok);
