#!/usr/bin/env bash
# Release Mardow: set the version, test, build the app, commit + tag, push, and publish a GitHub release
# with the zipped Mardow.app attached.
#
#   npm run release -- 0.2.0
#
# Needs: a clean git working tree with an `origin` remote, and `gh` logged in (gh auth login).
set -euo pipefail
cd "$(dirname "$0")/.."

die() { echo "release: $*" >&2; exit 1; }

version="${1:-}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "usage: npm run release -- <x.y.z>"
tag="v$version"

# Check everything before touching a file, so a failed check leaves nothing half done.
git rev-parse --git-dir >/dev/null 2>&1 || die "not a git repository (git init, then add an origin remote)"
git remote get-url origin >/dev/null 2>&1 || die "no 'origin' remote"
[[ -z "$(git status --porcelain)" ]] || die "uncommitted changes; commit or stash them first"
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && die "tag $tag already exists"
gh auth status >/dev/null 2>&1 || die "gh is not logged in (gh auth login)"

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

echo "→ commit, tag, push"
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git diff --cached --quiet || git commit -m "Release $tag" # nothing to commit when the version was already set
git tag -a "$tag" -m "Mardow $version"
git push origin HEAD "$tag"

echo "→ GitHub release"
gh release create "$tag" "$zip" --title "Mardow $version" --generate-notes
echo "✓ released $tag"
