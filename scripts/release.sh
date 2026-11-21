#!/usr/bin/env bash
# Release Mardow in one go, run from a terminal:
#   1. commit open changes (asks for a message, or -m)
#   2. set the next version, run the tests, build and sign the app
#   3. commit "Release vX", tag, push to origin
#   4. GitHub release with the zipped app, the signed update archive and latest.json
#   5. wait until the public update feed reports the new version
#
#   npm run release                      next patch version (0.2.2 → 0.2.3)
#   npm run release -- minor             0.2.2 → 0.3.0 (also: major, or an exact x.y.z)
#   npm run release -- -m "Neue Links"   commit message for open changes, without asking
#   npm run release -- --dry-run         only the checks and the summary, changes nothing
#   -y                                   no confirmation question (for scripts)
#
# Needs: a git repo with an `origin` remote on GitHub, `gh` logged in (gh auth login), and the updater
# signing key (~/.tauri/mardow.key, or TAURI_SIGNING_PRIVATE_KEY). Installed copies of Mardow read
# latest.json from the newest release to find and verify the update.
set -euo pipefail
cd "$(dirname "$0")/.."

die() { echo "release: $*" >&2; exit 1; }
usage() { sed -n '2,15s/^# \{0,1\}//p' "$0"; }

bump=patch message="" yes=0 dry=0
while (($#)); do
  case "$1" in
    -m | --message) message="${2:-}"; [[ -n "$message" ]] || die "-m needs a commit message"; shift 2 ;;
    -y | --yes) yes=1; shift ;;
    --dry-run) dry=1; shift ;;
    -h | --help) usage; exit 0 ;;
    patch | minor | major | [0-9]*) bump="$1"; shift ;;
    *) die "unknown argument: $1 (npm run release -- --help)" ;;
  esac
done

current="$(node -p 'require("./package.json").version')"
IFS=. read -r major minor patch <<<"$current"
case "$bump" in
  patch) version="$major.$minor.$((patch + 1))" ;;
  minor) version="$major.$((minor + 1)).0" ;;
  major) version="$((major + 1)).0.0" ;;
  *) version="$bump" ;;
esac
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "not a version: $version (use patch, minor, major or x.y.z)"
[[ "$(printf '%s\n' "$current" "$version" | sort -V | tail -1)" == "$version" ]] || die "$version is older than $current; installed copies would never offer it"
tag="v$version"

# Check everything before touching a file, so a failed check leaves nothing half done.
git rev-parse --git-dir >/dev/null 2>&1 || die "not a git repository (git init, then add an origin remote)"
git remote get-url origin >/dev/null 2>&1 || die "no 'origin' remote"
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && die "tag $tag already exists"
gh auth status >/dev/null 2>&1 || die "gh is not logged in (gh auth login)"
[[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" || -f "$HOME/.tauri/mardow.key" ]] || die "updater signing key missing (~/.tauri/mardow.key)"
repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"

# What goes out: open changes and the commits since the last release.
dirty="$(git status --porcelain)"
echo "Mardow $current → $version  ($(git branch --show-current) → $repo)"
if [[ -n "$dirty" ]]; then
  echo "Open changes (committed first):"
  git status --short | sed 's/^/  /'
fi
last="$(git describe --tags --abbrev=0 2>/dev/null || true)"
if [[ -n "$last" && -n "$(git log --oneline "$last..HEAD")" ]]; then
  echo "Commits since $last:"
  git log --oneline "$last..HEAD" | sed 's/^/  /'
fi
((dry)) && { echo "dry run: nothing changed"; exit 0; }

if [[ -n "$dirty" && -z "$message" ]]; then
  [[ -t 0 ]] || die "open changes: pass -m \"message\" to commit them with the release"
  read -r -p "Commit message for the open changes (empty = cancel): " message
  [[ -n "$message" ]] || die "cancelled"
fi
if ((!yes)); then
  [[ -t 0 ]] || die "not a terminal: pass -y to release without asking"
  read -r -p "Release $tag? [y/N] " answer
  [[ "$answer" =~ ^[yYjJ] ]] || die "cancelled"
fi

if [[ -n "$dirty" ]]; then
  echo "→ commit open changes"
  git add -A
  git commit -q -m "$message"
fi

echo "→ version $version"
npm version "$version" --no-git-tag-version --allow-same-version >/dev/null # package.json + package-lock.json
node -e '
  const fs = require("fs"), p = "src-tauri/tauri.conf.json", c = JSON.parse(fs.readFileSync(p, "utf8"));
  c.version = process.argv[1];
  fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
' "$version"
sed -i '' -E "1,/^version = /s/^version = \".*\"/version = \"$version\"/" src-tauri/Cargo.toml

echo "→ test and build"
npm test
npm run dist # also updates Cargo.lock to the new version

app="src-tauri/target/release/bundle/macos/Mardow.app"
[[ -d "$app" ]] || die "build did not produce $app"
zip="src-tauri/target/release/bundle/macos/Mardow-$version-macos-$(uname -m).zip"
rm -f "$zip"
ditto -c -k --keepParent "$app" "$zip" # keeps the bundle's symlinks and permissions, unlike plain zip

# Update files: the signed app archive under a versioned name, and latest.json pointing at it.
arch="$(uname -m)"; [[ "$arch" == arm64 ]] && arch=aarch64 # Tauri's platform names
bundle="src-tauri/target/release/bundle/macos"
[[ -f "$bundle/Mardow.app.tar.gz.sig" ]] || die "build did not produce the signed update archive"
tarball="$bundle/Mardow-$version-macos-$arch.app.tar.gz"
cp "$bundle/Mardow.app.tar.gz" "$tarball"
latest="$bundle/latest.json"
node -e '
  const [version, platform, url, sigFile, out] = process.argv.slice(1);
  const signature = require("fs").readFileSync(sigFile, "utf8").trim();
  const json = { version, pub_date: new Date().toISOString(), platforms: { [platform]: { url, signature } } };
  require("fs").writeFileSync(out, JSON.stringify(json, null, 2) + "\n");
' "$version" "darwin-$arch" "https://github.com/$repo/releases/download/$tag/$(basename "$tarball")" "$bundle/Mardow.app.tar.gz.sig" "$latest"

echo "→ commit, tag, push"
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git diff --cached --quiet || git commit -m "Release $tag" # nothing to commit when the version was already set
git tag -a "$tag" -m "Mardow $version"
git push origin HEAD "$tag"

echo "→ GitHub release"
gh release create "$tag" "$zip" "$tarball" "$latest" --title "Mardow $version" --generate-notes

echo "→ check the update feed"
feed="https://github.com/$repo/releases/latest/download/latest.json"
live=""
for _ in {1..10}; do
  live="$(curl -fsSL "$feed" 2>/dev/null | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).version' 2>/dev/null || true)"
  [[ "$live" == "$version" ]] && { echo "✓ released $tag: installed copies offer the update on their next start"; exit 0; }
  sleep 3
done
die "$tag is published, but $feed still reports ${live:-nothing}; check https://github.com/$repo/releases"
