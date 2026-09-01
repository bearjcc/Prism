#!/usr/bin/env sh
# Restore gitignored clones from references.lock.json (npm ci analogue).
# Default: enabled entries only (extension-first plus corpus feedstock:
# Catppuccin UserCSS, Wide GitHub, EasyList, YouTube NonStop).
# Archived native/DNS/proxy/marketplace: --include-archived
# After restore, sync private engine fixtures with:
#   node scripts/sync-corpus-from-references.mjs
set -eu

INCLUDE_ARCHIVED=0
for arg in "$@"; do
  case "$arg" in
    --include-archived|-IncludeArchived) INCLUDE_ARCHIVED=1 ;;
    -h|--help)
      echo "Usage: $0 [--include-archived]"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

REPO_ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
LOCK="$REPO_ROOT/references.lock.json"
REFERENCES_ROOT="$REPO_ROOT/References"

if [ ! -f "$LOCK" ]; then
  echo "Missing lockfile: $LOCK" >&2
  exit 1
fi

python3 - "$LOCK" "$REFERENCES_ROOT" "$INCLUDE_ARCHIVED" <<'PY'
import json, os, subprocess, sys

lock_path, references_root, include_archived = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
with open(lock_path, encoding="utf-8") as f:
    lock = json.load(f)
if "version" not in lock:
    raise SystemExit("references.lock.json must have version")

os.makedirs(references_root, exist_ok=True)
refs = lock.get("references") or []
if not refs:
    print("No references in lockfile.")
    raise SystemExit(0)

def run(cwd, args):
    subprocess.check_call(args, cwd=cwd)

for entry in refs:
    for key in ("id", "url", "ref", "sha", "dest"):
        if not entry.get(key):
            raise SystemExit(f"Reference {entry.get('id')!r} missing {key}")
    if entry.get("enabled", True) is False and not include_archived:
        print(f"SKIP archived {entry['id']} (use --include-archived)")
        continue
    dest = os.path.join(references_root, entry["dest"])
    sha = entry["sha"]
    if os.path.isdir(os.path.join(dest, ".git")):
        run(dest, ["git", "fetch", "--tags"])
        run(dest, ["git", "fetch", entry["url"], entry["ref"]])
    else:
        os.makedirs(references_root, exist_ok=True)
        subprocess.check_call(["git", "clone", entry["url"], dest])
    run(dest, ["git", "checkout", "--detach", sha])
    head = subprocess.check_output(["git", "-C", dest, "rev-parse", "HEAD"], text=True).strip()
    if head != sha:
        raise SystemExit(f"SHA mismatch for {entry['id']}: expected {sha}, got {head}")
    print(f"OK {entry['id']} -> {dest} ({sha})")
PY
